import { apiClient } from "./api";
import { useAuthStore } from "~/stores/auth";

// Set up the refresh token callback for the API client
// This must be called after the auth store is created to avoid circular dependencies
export function setupAuthRefresh() {
  apiClient.setRefreshTokenCallback(async () => {
    return useAuthStore.getState().refreshAccessToken();
  });
}
