/**
 * UserSecretsService - Lightweight wrapper around UserSecretsStore DO
 */

// Env is a global type in Cloudflare Workers
import type {
    SecretMetadata,
    StoreSecretRequest,
    UpdateSecretRequest,
    SecretWithValue,
    KeyRotationInfo
} from './types';

export class UserSecretsService {
    constructor(private readonly env: Env) {}

    /**
     * Get DO stub for a user
     */
    private getStub(userId: string) {
        const id = this.env.UserSecretsStore.idFromName(userId);
        return this.env.UserSecretsStore.get(id);
    }

    /**
     * List all secrets (metadata only) for a user
     */
    async listSecrets(userId: string): Promise<SecretMetadata[]> {
        const stub = this.getStub(userId);
        return stub.listSecrets();
    }

    /**
     * Store a new secret
     */
    async storeSecret(userId: string, request: StoreSecretRequest): Promise<SecretMetadata | null> {
        const stub = this.getStub(userId);
        return stub.storeSecret(request);
    }

    /**
     * Get decrypted secret value
     */
    async getSecretValue(userId: string, secretId: string): Promise<SecretWithValue | null> {
        const stub = this.getStub(userId);
        return stub.getSecretValue(secretId);
    }

    /**
     * Get secret with value by ID (alias for getSecretValue)
     */
    async getSecretWithValue(userId: string, secretId: string): Promise<SecretWithValue | null> {
        return this.getSecretValue(userId, secretId);
    }

    /**
     * Update secret (metadata or value)
     */
    async updateSecret(userId: string, secretId: string, updates: UpdateSecretRequest): Promise<SecretMetadata | null> {
        const stub = this.getStub(userId);
        return stub.updateSecret(secretId, updates);
    }

    /**
     * Delete a secret (soft delete)
     */
    async deleteSecret(userId: string, secretId: string): Promise<boolean> {
        const stub = this.getStub(userId);
        return stub.deleteSecret(secretId);
    }

    // Note: toggleActive method not yet implemented in UserSecretsStore
    // Can be added if needed in the future

    /**
     * Get key rotation info
     */
    async getKeyRotationInfo(userId: string): Promise<KeyRotationInfo> {
        const stub = this.getStub(userId);
        return stub.getKeyRotationInfo();
    }

    // Note: rotateKey method not yet implemented in UserSecretsStore
    // Key rotation is handled internally by the DO

    // ==========================================
    // CONVENIENCE METHODS
    // ==========================================

    /**
     * Get Cloudflare account credentials
     * Returns null if not configured
     */
    async getCloudflareCredentials(userId: string): Promise<{
        accountId: string;
        apiToken: string;
    } | null> {
        try {
            const secrets = await this.listSecrets(userId);
            const cfSecret = secrets.find(
                s => s.secretType === 'cloudflare_account' && s.isActive
            );

            if (!cfSecret) {
                return null;
            }

            const secretWithValue = await this.getSecretValue(userId, cfSecret.id);
            if (!secretWithValue) {
                return null;
            }
            return JSON.parse(secretWithValue.value);
        } catch (error) {
            console.error('Failed to get Cloudflare credentials', error);
            return null;
        }
    }

    /**
     * Store Cloudflare account credentials
     */
    async storeCloudflareCredentials(
        userId: string,
        credentials: {
            accountId: string;
            apiToken: string;
        },
        metadata?: Record<string, unknown>
    ): Promise<SecretMetadata | null> {
        return this.storeSecret(userId, {
            name: 'Cloudflare Account',
            secretType: 'cloudflare_account',
            value: JSON.stringify(credentials),
            metadata
        });
    }

    /**
     * Check if user has active Cloudflare credentials
     */
    async hasCloudflareCredentials(userId: string): Promise<boolean> {
        const credentials = await this.getCloudflareCredentials(userId);
        return credentials !== null;
    }

    /**
     * Get secret by type and provider (useful for API keys)
     */
    async getSecretByType(
        userId: string,
        secretType: string,
        provider?: string
    ): Promise<SecretWithValue | null> {
        try {
            const secrets = await this.listSecrets(userId);
            const secret = secrets.find(
                s => s.secretType === secretType && 
                     (!provider || s.provider === provider) && 
                     s.isActive
            );

            if (!secret) {
                return null;
            }

            return this.getSecretWithValue(userId, secret.id);
        } catch (error) {
            console.error('Failed to get secret by type', error);
            return null;
        }
    }
}
