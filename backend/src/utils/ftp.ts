import { Client } from "basic-ftp";
import fs from "fs";
import path from "path";
import { Readable, Writable } from "stream";
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
      logger.info(`FTP connected. Current directory: ${await client.pwd()}`);
      return client;
    } catch (error) {
      logger.error("FTP connection failed:", error);
      throw new Error(
        `Failed to connect to FTP server: ${(error as Error).message}`
      );
    }
  }

  private async ensureDirectoryExists(client: Client, remotePath: string) {
    try {
      // basic-ftp ensureDir will create nested directories and navigate into it
      await client.ensureDir(remotePath);
      logger.debug(`Ensured directory exists and navigated to: ${remotePath}`);
    } catch (error) {
      logger.error(
        `Failed to ensure directory ${remotePath}:`,
        (error as Error).message
      );
      throw error;
    }
  }

  async uploadFile(
    localPathOrBuffer: string | Buffer,
    remotePath: string
  ): Promise<void> {
    const client = await this.getClient();
    try {
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);

      await this.ensureDirectoryExists(client, remoteDir);

      if (typeof localPathOrBuffer === "string") {
        await client.uploadFrom(localPathOrBuffer, fileName);
      } else {
        const bufferStream = Readable.from(localPathOrBuffer);
        await client.uploadFrom(bufferStream, fileName);
      }

      logger.info(`File uploaded to FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP upload failed:", error);
      throw new Error(`Failed to upload file: ${(error as Error).message}`);
    } finally {
      client.close();
    }
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const client = await this.getClient();
    try {
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);

      await this.ensureDirectoryExists(client, remoteDir);

      // Check if file exists
      const list = await client.list(".");
      const fileExists = list.some((item) => item.name === fileName);
      if (!fileExists) throw new Error(`File ${fileName} not found on FTP`);

      await client.downloadTo(localPath, fileName);
      logger.info(`File downloaded from FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP download failed:", error);
      throw new Error(`Failed to download file: ${(error as Error).message}`);
    } finally {
      client.close();
    }
  }

  async downloadToBuffer(remotePath: string): Promise<Buffer> {
    const client = await this.getClient();
    try {
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);

      await this.ensureDirectoryExists(client, remoteDir);

      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const writable = new Writable({
          write(chunk: Buffer, encoding, callback) {
            chunks.push(chunk);
            callback();
          },
          final(callback) {
            resolve(Buffer.concat(chunks));
            callback();
          },
        });

        writable.on("error", reject);
        client.downloadTo(writable, fileName).catch(reject);
      });
    } catch (error) {
      logger.error("FTP download to buffer failed:", error);
      throw new Error(
        `Failed to download file to buffer: ${(error as Error).message}`
      );
    } finally {
      client.close();
    }
  }

  async deleteFile(remotePath: string): Promise<void> {
    const client = await this.getClient();
    try {
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);

      await this.ensureDirectoryExists(client, remoteDir);
      await client.remove(fileName);

      logger.info(`File deleted from FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP delete failed:", error);
      throw new Error(`Failed to delete file: ${(error as Error).message}`);
    } finally {
      client.close();
    }
  }

  async createDirectory(remotePath: string): Promise<void> {
    const client = await this.getClient();
    try {
      await this.ensureDirectoryExists(client, remotePath);
      logger.info(`Directory created on FTP: ${remotePath}`);
    } catch (error) {
      logger.error("FTP directory creation failed:", error);
      throw new Error(
        `Failed to create directory: ${(error as Error).message}`
      );
    } finally {
      client.close();
    }
  }

  async fileExists(remotePath: string): Promise<boolean> {
    const client = await this.getClient();
    try {
      const remoteDir = path.dirname(remotePath);
      const fileName = path.basename(remotePath);

      await this.ensureDirectoryExists(client, remoteDir);
      const list = await client.list(".");
      return list.some((item) => item.name === fileName);
    } catch (error) {
      logger.error("FTP file check failed:", error);
      return false;
    } finally {
      client.close();
    }
  }
}

export default new FTPService();
