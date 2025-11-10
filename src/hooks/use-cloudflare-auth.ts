import { useState } from 'react';
import type { CloudflareAuthStatus } from '@/api-types';

/**
 * Hook to manage Cloudflare account connection status
 * 
 * NOTE: This is a stub implementation. Backend API endpoints (/api/user/cloudflare-auth)
 * are being implemented in parallel. Once available, this hook should:
 * - Fetch auth status on mount
 * - Call POST /api/user/cloudflare-auth to connect
 * - Call DELETE /api/user/cloudflare-auth to disconnect
 * - Validate tokens against Cloudflare API
 */
export function useCloudflareAuth() {
  // Stub implementation - returns not authenticated by default
  // Backend implementation will replace this with actual API calls
  const [data, setData] = useState<CloudflareAuthStatus>({ 
    authenticated: false 
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = async (apiToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // TODO: Call backend API when implemented
      // const response = await apiClient.connectCloudflareAccount({ apiToken });
      // setData(response.data);
      
      // Stub: Simulate success
      console.log('Cloudflare auth stub: connecting with token:', apiToken.substring(0, 10) + '...');
      setData({
        authenticated: true,
        account: {
          id: 'stub-account-id',
          email: 'user@example.com',
          name: 'Stub Account',
        },
      });
      return { valid: true };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // TODO: Call backend API when implemented
      // await apiClient.disconnectCloudflareAccount();
      
      // Stub: Simulate disconnection
      setData({ authenticated: false });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to disconnect');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    data,
    isLoading,
    error,
    connect,
    disconnect,
  };
}
