#!/usr/bin/env bun
/**
 * Interactive CLI for VibeSDK
 * 
 * Usage:
 *   bun run cli.ts --url http://localhost:5173
 *   bun run cli.ts (defaults to http://localhost:5173)
 */

import { parseArgs } from 'util';

// Terminal colors and styles
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
};

// Box drawing characters
const box = {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    verticalRight: '├',
    verticalLeft: '┤',
    horizontalDown: '┬',
    horizontalUp: '┴',
    cross: '┼',
};

// Icon mappings
const icons = {
    rocket: '🚀',
    check: '✓',
    cross: '✗',
    info: 'ℹ',
    warning: '⚠',
    error: '✗',
    loading: '⏳',
    file: '📄',
    folder: '📁',
    deploy: '🌐',
    workflow: '⚙️',
    app: '📱',
    thinking: '🤔',
    success: '✅',
    chat: '💬',
    arrow: '→',
    bullet: '•',
};

class CLI {
    private baseUrl: string;
    private ws: WebSocket | null = null;
    private agentId: string | null = null;
    private projectType: 'app' | 'workflow' = 'app';
    private isConnected = false;
    private messageQueue: Array<() => void> = [];
    private cookieJar: Map<string, string> = new Map();
    private csrfToken: string | null = null;
    private sessionToken: string | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    // ============================================================
    // UI Helpers
    // ============================================================

    private clearScreen() {
        console.log('\x1Bc');
    }

    private print(text: string) {
        process.stdout.write(text);
    }

    private println(text: string = '') {
        console.log(text);
    }

    private printBox(title: string, content: string[], width = 80) {
        const titleStr = ` ${title} `;
        const titlePadding = Math.max(0, Math.floor((width - titleStr.length - 2) / 2));
        
        this.println(`${colors.cyan}${box.topLeft}${box.horizontal.repeat(titlePadding)}${titleStr}${box.horizontal.repeat(width - titlePadding - titleStr.length - 2)}${box.topRight}${colors.reset}`);
        
        for (const line of content) {
            const padding = ' '.repeat(Math.max(0, width - line.length - 2));
            this.println(`${colors.cyan}${box.vertical}${colors.reset} ${line}${padding}${colors.cyan}${box.vertical}${colors.reset}`);
        }
        
        this.println(`${colors.cyan}${box.bottomLeft}${box.horizontal.repeat(width - 2)}${box.bottomRight}${colors.reset}`);
    }

    private printHeader() {
        this.clearScreen();
        this.println();
        this.printBox('VibeSDK Interactive CLI', [
            `${colors.bright}${colors.cyan}${icons.rocket} Build apps and workflows with AI${colors.reset}`,
            '',
            `${colors.dim}Connected to: ${colors.reset}${colors.blue}${this.baseUrl}${colors.reset}`,
        ]);
        this.println();
    }

    private printStatus(status: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
        const colorMap = {
            info: colors.blue,
            success: colors.green,
            error: colors.red,
            warning: colors.yellow,
        };
        const iconMap = {
            info: icons.info,
            success: icons.success,
            error: icons.error,
            warning: icons.warning,
        };
        
        this.println(`${colorMap[type]}${iconMap[type]} ${status}${colors.reset}`);
    }

    private async prompt(question: string): Promise<string> {
        this.print(`${colors.cyan}${icons.chat} ${question}${colors.reset} `);
        
        return new Promise((resolve) => {
            process.stdin.setRawMode(false);
            process.stdin.once('data', (data) => {
                resolve(data.toString().trim());
            });
        });
    }

    private async select(question: string, options: Array<{ label: string; value: string }>): Promise<string> {
        let selectedIndex = 0;
        
        const render = () => {
            // Move cursor up by number of options + 2 (question + empty line)
            if (selectedIndex > 0) {
                process.stdout.write(`\x1b[${options.length + 2}A`);
            }
            
            this.println(`${colors.cyan}${icons.chat} ${question}${colors.reset}`);
            this.println();
            
            options.forEach((option, index) => {
                const isSelected = index === selectedIndex;
                const indicator = isSelected ? `${colors.green}${icons.arrow}${colors.reset}` : ' ';
                const label = isSelected ? `${colors.bright}${colors.green}${option.label}${colors.reset}` : option.label;
                this.println(`  ${indicator} ${label}`);
            });
        };

        return new Promise((resolve) => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            
            render();
            
            const onData = (buffer: Buffer) => {
                const key = buffer.toString();
                
                // Arrow up
                if (key === '\x1b[A') {
                    selectedIndex = Math.max(0, selectedIndex - 1);
                    render();
                }
                // Arrow down
                else if (key === '\x1b[B') {
                    selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
                    render();
                }
                // Enter
                else if (key === '\r' || key === '\n') {
                    process.stdin.setRawMode(false);
                    process.stdin.removeListener('data', onData);
                    this.println();
                    resolve(options[selectedIndex].value);
                }
                // Ctrl+C
                else if (key === '\x03') {
                    process.stdin.setRawMode(false);
                    this.println();
                    this.printStatus('Cancelled by user', 'warning');
                    process.exit(0);
                }
            };
            
            process.stdin.on('data', onData);
        });
    }

    // ============================================================
    // API Methods
    // ============================================================

    /**
     * Parse Set-Cookie headers and store in cookie jar
     */
    private storeCookies(response: Response) {
        const setCookieHeaders = response.headers.getSetCookie?.() || [];
        for (const cookie of setCookieHeaders) {
            const [nameValue] = cookie.split(';');
            const [name, value] = nameValue.split('=');
            if (name && value) {
                this.cookieJar.set(name.trim(), value.trim());
            }
        }
    }

    /**
     * Get Cookie header from cookie jar
     */
    private getCookieHeader(): string {
        return Array.from(this.cookieJar.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    /**
     * Fetch CSRF token from the server
     */
    private async fetchCsrfToken(): Promise<boolean> {
        try {
            this.printStatus('Fetching CSRF token...', 'info');
            
            const response = await fetch(`${this.baseUrl}/api/auth/csrf-token`, {
                method: 'GET',
                headers: this.getCookieHeader() ? {
                    'Cookie': this.getCookieHeader()
                } : {}
            });

            if (!response.ok) {
                this.printStatus(`Failed to fetch CSRF token: ${response.statusText}`, 'error');
                return false;
            }

            // Store cookies from response
            this.storeCookies(response);

            const data = await response.json();
            if (data.data?.token) {
                this.csrfToken = data.data.token;
                this.printStatus('CSRF token obtained', 'success');
                return true;
            }

            return false;
        } catch (error) {
            this.printStatus(`Error fetching CSRF token: ${error}`, 'error');
            return false;
        }
    }

    /**
     * Generate anonymous session token
     */
    private generateSessionToken(): string {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Initialize authentication (CSRF token and session)
     */
    private async initializeAuth(): Promise<boolean> {
        // Generate session token for anonymous access
        this.sessionToken = this.generateSessionToken();
        
        // Fetch CSRF token
        return await this.fetchCsrfToken();
    }

    private async createSession(query: string): Promise<{ agentId: string; websocketUrl: string }> {
        this.printStatus('Creating new session...', 'info');
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        // Add CSRF token to headers
        if (this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
        }

        // Add session token for anonymous access
        if (this.sessionToken) {
            headers['X-Session-Token'] = this.sessionToken;
        }

        // Add cookies
        const cookieHeader = this.getCookieHeader();
        if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
        }
        
        const response = await fetch(`${this.baseUrl}/api/agent`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query,
                projectType: this.projectType,
                agentMode: 'deterministic',
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create session: ${response.statusText}`);
        }

        // Store cookies from response
        this.storeCookies(response);

        // Parse NDJSON stream
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let agentId = '';
        let websocketUrl = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    
                    if (data.agentId) {
                        agentId = data.agentId;
                        this.agentId = agentId;
                    }
                    if (data.websocketUrl) {
                        websocketUrl = data.websocketUrl;
                    }
                    if (data.message) {
                        this.printStatus(data.message, 'info');
                    }
                    if (data.chunk) {
                        // Blueprint streaming (for apps)
                        this.print(`${colors.dim}${data.chunk}${colors.reset}`);
                    }
                } catch (e: unknown) {
                    // Ignore parse errors for incomplete JSON
                }
            }
        }

        if (!agentId || !websocketUrl) {
            throw new Error('Failed to get agent ID or WebSocket URL from server');
        }

        return { agentId, websocketUrl };
    }

    // ============================================================
    // WebSocket Methods
    // ============================================================

    private connectWebSocket(wsUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.printStatus(`Connecting to agent via WebSocket...`, 'info');
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.printStatus('WebSocket connected!', 'success');
                this.println();
                
                // Process queued messages
                while (this.messageQueue.length > 0) {
                    const fn = this.messageQueue.shift();
                    fn?.();
                }
                
                resolve();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = typeof event.data === 'string' ? event.data : event.data.toString();
                    const message = JSON.parse(data);
                    this.handleWebSocketMessage(message);
                } catch (e: unknown) {
                    this.printStatus(`Error parsing WebSocket message: ${e}`, 'error');
                }
            };
            
            this.ws.onerror = (error: Event) => {
                this.printStatus(`WebSocket error: ${error.type}`, 'error');
                reject(new Error('WebSocket connection error'));
            };
            
            this.ws.onclose = () => {
                this.isConnected = false;
                this.printStatus('WebSocket connection closed', 'warning');
            };
        });
    }

    private handleWebSocketMessage(message: any) {
        const type = message.type;
        
        switch (type) {
            case 'generation_started':
                this.println(`${colors.green}${icons.rocket} Code generation started${colors.reset}`);
                break;
            
            case 'generation_complete':
                this.println(`${colors.green}${icons.success} Code generation complete!${colors.reset}`);
                this.println();
                break;
            
            case 'phase_generating':
                this.println(`${colors.blue}${icons.loading} Generating phase: ${colors.bright}${message.phaseName}${colors.reset}`);
                if (message.description) {
                    this.println(`${colors.dim}  ${message.description}${colors.reset}`);
                }
                break;
            
            case 'phase_generated':
                this.println(`${colors.green}${icons.check} Phase generated: ${colors.bright}${message.phaseName}${colors.reset}`);
                break;
            
            case 'phase_implementing':
                this.println(`${colors.blue}${icons.loading} Implementing: ${colors.bright}${message.message}${colors.reset}`);
                break;
            
            case 'phase_implemented':
                this.println(`${colors.green}${icons.check} Implemented: ${colors.bright}${message.message}${colors.reset}`);
                break;
            
            case 'file_generating':
                this.println(`${colors.cyan}${icons.file} Generating: ${colors.bright}${message.filePath}${colors.reset}`);
                if (message.filePurpose) {
                    this.println(`${colors.dim}  ${message.filePurpose}${colors.reset}`);
                }
                break;
            
            case 'file_generated':
                this.println(`${colors.green}${icons.check} Generated: ${colors.bright}${message.file?.path}${colors.reset}`);
                break;
            
            case 'deployment_started':
                this.println(`${colors.blue}${icons.deploy} Deployment started...${colors.reset}`);
                break;
            
            case 'deployment_completed':
                this.println(`${colors.green}${icons.success} Deployment complete!${colors.reset}`);
                if (message.previewURL) {
                    this.println(`${colors.bright}${colors.cyan}Preview URL: ${message.previewURL}${colors.reset}`);
                }
                this.println();
                break;
            
            case 'deployment_failed':
                this.println(`${colors.red}${icons.error} Deployment failed: ${message.error}${colors.reset}`);
                break;
            
            case 'cloudflare_deployment_completed':
                this.println(`${colors.green}${icons.success} Cloudflare deployment complete!${colors.reset}`);
                if (message.url) {
                    this.println(`${colors.bright}${colors.cyan}Deployment URL: ${message.url}${colors.reset}`);
                }
                this.println();
                break;
            
            case 'user_suggestions_processing':
                this.println(`${colors.blue}${icons.thinking} Processing your message...${colors.reset}`);
                break;
            
            case 'conversation_response':
                this.println(`${colors.cyan}${icons.chat} ${colors.bright}Agent:${colors.reset} ${message.message}`);
                this.println();
                break;
            
            case 'error':
                this.println(`${colors.red}${icons.error} Error: ${message.error || message.message}${colors.reset}`);
                break;
            
            case 'runtime_error_found':
                this.println(`${colors.yellow}${icons.warning} Runtime error detected${colors.reset}`);
                if (message.errors && message.errors.length > 0) {
                    message.errors.forEach((err: any) => {
                        this.println(`${colors.dim}  ${err.message}${colors.reset}`);
                    });
                }
                break;
            
            case 'static_analysis_results':
                if (message.hasErrors) {
                    this.println(`${colors.yellow}${icons.warning} Static analysis found issues${colors.reset}`);
                }
                break;
            
            default:
                // Log unknown messages for debugging
                if (message.message) {
                    this.println(`${colors.dim}[${type}] ${message.message}${colors.reset}`);
                }
        }
    }

    private sendWebSocketMessage(message: any) {
        if (!this.isConnected || !this.ws) {
            this.messageQueue.push(() => this.sendWebSocketMessage(message));
            return;
        }
        
        this.ws.send(JSON.stringify(message));
    }

    // ============================================================
    // Main Flow
    // ============================================================

    async start() {
        this.printHeader();
        
        // Step 1: Initialize authentication
        const authSuccess = await this.initializeAuth();
        if (!authSuccess) {
            this.printStatus('Failed to initialize authentication. Please check your server.', 'error');
            process.exit(1);
        }
        
        this.println();
        
        // Step 2: Select project type
        this.projectType = await this.select('Select project type:', [
            { label: `${icons.app} App - Full-stack application with React + Vite`, value: 'app' },
            { label: `${icons.workflow} Workflow - Cloudflare Workflows (durable execution)`, value: 'workflow' },
        ]) as 'app' | 'workflow';
        
        this.println();
        this.printStatus(`Selected: ${this.projectType === 'app' ? 'App' : 'Workflow'}`, 'success');
        this.println();
        
        // Step 3: Get project description
        const query = await this.prompt('What would you like to build?');
        
        if (!query) {
            this.printStatus('No input provided. Exiting.', 'error');
            process.exit(1);
        }
        
        this.println();
        
        try {
            // Step 4: Create session
            const { agentId, websocketUrl } = await this.createSession(query);
            
            this.println();
            this.printStatus(`Agent ID: ${agentId}`, 'success');
            this.println();
            
            // Step 5: Connect to WebSocket
            await this.connectWebSocket(websocketUrl);
            
            // Step 6: Start generation
            this.printStatus('Starting code generation...', 'info');
            this.println();
            
            this.sendWebSocketMessage({ type: 'generate_all' });
            
            // Step 7: Interactive chat loop
            await this.chatLoop();
            
        } catch (error) {
            this.printStatus(`Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
            process.exit(1);
        }
    }

    private async chatLoop() {
        this.println();
        this.println(`${colors.bright}${colors.cyan}Interactive Commands:${colors.reset}`);
        this.println(`  ${colors.dim}/deploy${colors.reset}     - Deploy preview to sandbox`);
        this.println(`  ${colors.dim}/stop${colors.reset}       - Stop generation`);
        this.println(`  ${colors.dim}/resume${colors.reset}     - Resume generation`);
        this.println(`  ${colors.dim}/cloudflare${colors.reset} - Deploy to Cloudflare`);
        this.println(`  ${colors.dim}/quit${colors.reset}       - Exit CLI`);
        this.println(`  ${colors.dim}[message]${colors.reset}   - Send message to agent`);
        this.println();
        
        while (true) {
            const input = await this.prompt('You:');
            
            if (!input) continue;
            
            // Handle commands
            if (input.startsWith('/')) {
                const command = input.slice(1).toLowerCase();
                
                switch (command) {
                    case 'deploy':
                        this.sendWebSocketMessage({ type: 'preview' });
                        this.printStatus('Deploying preview...', 'info');
                        break;
                    
                    case 'stop':
                        this.sendWebSocketMessage({ type: 'stop_generation' });
                        this.printStatus('Stopping generation...', 'info');
                        break;
                    
                    case 'resume':
                        this.sendWebSocketMessage({ type: 'resume_generation' });
                        this.printStatus('Resuming generation...', 'info');
                        break;
                    
                    case 'cloudflare':
                        this.sendWebSocketMessage({ type: 'deploy' });
                        this.printStatus('Deploying to Cloudflare...', 'info');
                        break;
                    
                    case 'quit':
                    case 'exit':
                        this.printStatus('Goodbye!', 'success');
                        this.ws?.close();
                        process.exit(0);
                        break;
                    
                    default:
                        this.printStatus(`Unknown command: /${command}`, 'error');
                }
            } else {
                // Send user message to agent
                this.sendWebSocketMessage({
                    type: 'user_suggestion',
                    message: input,
                });
            }
            
            this.println();
        }
    }
}

// ============================================================
// Main Entry Point
// ============================================================

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            url: {
                type: 'string',
                default: 'http://localhost:5173',
            },
            help: {
                type: 'boolean',
                short: 'h',
            },
        },
    });

    if (values.help) {
        console.log(`
${colors.cyan}${colors.bright}VibeSDK Interactive CLI${colors.reset}

${colors.bright}Usage:${colors.reset}
  bun run cli.ts [options]

${colors.bright}Options:${colors.reset}
  --url <url>    Server URL (default: http://localhost:5173)
  -h, --help     Show this help message

${colors.bright}Examples:${colors.reset}
  bun run cli.ts
  bun run cli.ts --url https://vibesdk.com
`);
        process.exit(0);
    }

    const url = values.url as string;
    
    const cli = new CLI(url);
    await cli.start();
}

main().catch((error) => {
    console.error(`${colors.red}${icons.error} Fatal error:${colors.reset}`, error);
    process.exit(1);
});
