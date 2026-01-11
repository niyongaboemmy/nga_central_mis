import { Client } from "basic-ftp";
import fs from "fs";
import path from "path";
import { Readable, PassThrough } from "stream";
import logger from "./logger";

interface FTPConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
}

class FTPService {
  private config: FTPConfig;

  constructor() {
    this.config = {
      host: process.env.FTP_HOST || "",
      port: parseInt(process.env.FTP_PORT || "21"),
      user: process.env.FTP_USER || "",
      password: process.env.FTP_PASSWORD || "",
      secure: process.env.FTP_SECURE === "true",
    };

    if (!this.config.host || !this.config.user || !this.config.password) {
      throw new Error(
        "FTP configuration is incomplete. Please check environment variables."
      );
    }
  }

  private async getClient(): Promise<Client> {
    const client = new Client();
    client.ftp.verbose = process.env.NODE_ENV === "development";

    try {
      await client.access(this.config);
      // Log current working directory
      try {
        const pwd = await client.pwd();
        logger.info(`FTP connected. Current directory: ${pwd}`);
      } catch (pwdError) {
        logger.warn(
          "Could not get current directory:",
          (pwdError as Error).message
        );
      }
      return client;
    } catch (error) {
      logger.error("FTP connection failed:", error);
      throw new Error("Failed to connect to FTP server");
    }
  }

  async uploadFile(
    localPathOrBuffer: string | Buffer,
    remotePath: string
  ): Promise<void> {
    const client = await this.getClient();

    try {
      // Ensure remote directory exists and navigate to it
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);
      await this.ensureDirectoryExists(client, remoteDir);

      // Upload file (using just the filename since we're in the correct directory)
      if (typeof localPathOrBuffer === "string") {
        // File path
        await client.uploadFrom(localPathOrBuffer, fileName);
      } else {
        // Buffer - convert to readable stream
        const stream = Readable.from(localPathOrBuffer);
        await client.uploadFrom(stream, fileName);
      }
      logger.info(`File uploaded to FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP upload failed:", error);
      throw new Error("Failed to upload file to FTP server");
    } finally {
      client.close();
    }
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const client = await this.getClient();

    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      // Navigate to remote directory and download file
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);
      logger.info(
        `FTP download: remotePath=${remotePath}, remoteDir=${remoteDir}, fileName=${fileName}`
      );

      await this.ensureDirectoryExists(client, remoteDir);

      // Check if file exists before downloading
      const list = await client.list(".");
      const fileExists = list.some((item: any) => item.name === fileName);
      logger.info(`FTP file exists check: ${fileName} exists=${fileExists}`);

      if (!fileExists) {
        throw new Error(`File ${fileName} not found in directory ${remoteDir}`);
      }

      // Download file (using just the filename since we're in the correct directory)
      await client.downloadTo(localPath, fileName);
      logger.info(`File downloaded from FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP download failed:", error);
      throw new Error("Failed to download file from FTP server");
    } finally {
      client.close();
    }
  }

  async downloadToBuffer(remotePath: string): Promise<Buffer> {
    const client = await this.getClient();

    try {
      // Navigate to remote directory
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);
      logger.info(
        `FTP download to buffer: remotePath=${remotePath}, remoteDir=${remoteDir}, fileName=${fileName}`
      );

      await this.ensureDirectoryExists(client, remoteDir);

      // Check if file exists
      const list = await client.list(".");
      const fileExists = list.some((item: any) => item.name === fileName);
      logger.info(`FTP file exists check: ${fileName} exists=${fileExists}`);

      if (!fileExists) {
        throw new Error(`File ${fileName} not found in directory ${remoteDir}`);
      }

      // Create a PassThrough stream to collect data
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];

      // Collect data from the stream
      passThrough.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      // Download to the PassThrough stream
      await client.downloadTo(passThrough, fileName);

      // Wait for stream to end and return buffer
      return new Promise((resolve, reject) => {
        passThrough.on("end", () => {
          const buffer = Buffer.concat(chunks);
          logger.info(
            `File downloaded to buffer from FTP: ${remotePath}, size: ${buffer.length} bytes`
          );
          resolve(buffer);
        });
        passThrough.on("error", reject);
      });
    } catch (error) {
      logger.error("FTP download to buffer failed:", error);
      throw new Error("Failed to download file from FTP server");
    } finally {
      client.close();
    }
  }

  async deleteFile(remotePath: string): Promise<void> {
    const client = await this.getClient();

    try {
      // Navigate to remote directory and delete file
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);
      await this.ensureDirectoryExists(client, remoteDir);

      // Delete file (using just the filename since we're in the correct directory)
      await client.remove(fileName);
      logger.info(`File deleted from FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP delete failed:", error);
      throw new Error("Failed to delete file from FTP server");
    } finally {
      client.close();
    }
  }

  async ensureDirectoryExists(
    client: Client,
    remotePath: string
  ): Promise<void> {
    const parts = remotePath.split("/").filter((part) => part.length > 0);
    let currentPath = "";

    for (const part of parts) {
      currentPath += "/" + part;
      try {
        await client.ensureDir(currentPath);
        logger.debug(`Ensured directory exists: ${currentPath}`);
      } catch (error) {
        // Directory might already exist, continue
        logger.debug(
          `Directory ${currentPath} may already exist:`,
          (error as Error).message
        );
      }
    }

    // Navigate to the target directory
    try {
      await client.cd(remotePath);
      logger.debug(`Changed to directory: ${remotePath}`);
    } catch (error) {
      logger.error(
        `Failed to change to directory ${remotePath}:`,
        (error as Error).message
      );
      throw error;
    }
  }

  async createDirectory(remotePath: string): Promise<void> {
    const client = await this.getClient();

    try {
      await this.ensureDirectoryExists(client, remotePath);
      logger.info(`Directory created on FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP directory creation failed:", error);
      throw new Error("Failed to create directory on FTP server");
    } finally {
      client.close();
    }
  }

  async fileExists(remotePath: string): Promise<boolean> {
    const client = await this.getClient();

    try {
      // Navigate to remote directory and check for file
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);
      await this.ensureDirectoryExists(client, remoteDir);

      const list = await client.list(".");
      return list.some((item: any) => item.name === fileName);
    } catch (error) {
      logger.error("FTP file check failed:", error);
      return false;
    } finally {
      client.close();
    }
  }
}

export default new FTPService();
