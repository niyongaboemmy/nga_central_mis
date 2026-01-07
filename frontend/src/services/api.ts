import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

// Simple toast store for use in API interceptor
class ToastStore {
  private static instance: {
    showToast?: (message: string, type?: any) => void;
  } = {};

  static setShowToast(fn: (message: string, type?: any) => void) {
    this.instance.showToast = fn;
  }

  static getShowToast() {
    return this.instance.showToast;
  }
}

// Create axios instance with default config
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://ngamisapi.vms.rw",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = localStorage.getItem("token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError): Promise<AxiosError> => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    return response;
  },
  (error: AxiosError): Promise<AxiosError> => {
    const showToast = ToastStore.getShowToast();

    if (error.response?.status === 401) {
      // Only redirect if we have a token (meaning user was logged in)
      const token = localStorage.getItem("token");
      if (
        token &&
        !error.config?.url?.includes("/auth/login") &&
        !error.config?.url?.includes("/auth/verify-otp")
      ) {
        // Token expired or invalid - redirect to login
        localStorage.removeItem("token");
        window.location.href = "/";
      }
    } else if (error.response?.status === 403) {
      // Show toast for forbidden access
      if (showToast) {
        showToast("You don't have permission to access this resource", "error");
      }
    }
    return Promise.reject(error);
  }
);

// Export toast store for use in App.tsx
export { ToastStore };

// API methods wrapper for common operations
export const apiService = {
  get: <T = any>(url: string, config?: any): Promise<AxiosResponse<T>> =>
    api.get(url, config),
  post: <T = any>(
    url: string,
    data?: any,
    config?: any
  ): Promise<AxiosResponse<T>> => api.post(url, data, config),
  put: <T = any>(
    url: string,
    data?: any,
    config?: any
  ): Promise<AxiosResponse<T>> => api.put(url, data, config),
  delete: <T = any>(url: string, config?: any): Promise<AxiosResponse<T>> =>
    api.delete(url, config),
  patch: <T = any>(
    url: string,
    data?: any,
    config?: any
  ): Promise<AxiosResponse<T>> => api.patch(url, data, config),
};

export default api;
