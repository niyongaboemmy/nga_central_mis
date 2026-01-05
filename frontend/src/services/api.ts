import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

// Create axios instance with default config
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5001",
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
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem("token");
      // Optionally redirect to login
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

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
