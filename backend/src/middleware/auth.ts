import jwt from "jsonwebtoken";
import { getUserPermissions } from "../utils/auth";

export const authenticate = async (req: any, res: any, next: any) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }
  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded;
    req.user.permissions = await getUserPermissions(decoded.userId);
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const authorize =
  (requiredPerm: string) => (req: any, res: any, next: any) => {
    if (!req.user.permissions.includes(requiredPerm)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
