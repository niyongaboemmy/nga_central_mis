import validator from "validator";

export const sanitizeString = (str: string | undefined): string => {
  if (typeof str !== "string") {
    return "";
  }
  return validator.escape(str.trim());
};

export const sanitizeEmail = (email: string): string => {
  return validator.normalizeEmail(email) || email;
};

export const sanitizeInput = (input: any): any => {
  if (typeof input === "string") {
    return sanitizeString(input);
  }

  if (typeof input === "object" && input !== null) {
    const sanitized: any = Array.isArray(input) ? [] : {};

    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        sanitized[key] = sanitizeInput(input[key]);
      }
    }

    return sanitized;
  }

  return input;
};

export const validateEmail = (email: string): boolean => {
  return validator.isEmail(email);
};

export const validatePassword = (
  password: string
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (!/(?=.*[a-z])/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/(?=.*\d)/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
