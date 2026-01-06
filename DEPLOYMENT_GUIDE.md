# Backend Deployment Guide - Namecheap cPanel

## Prerequisites

Before deploying, ensure you have:

- **Namecheap hosting account** with **Node.js support** (cPanel Ultimate or Business plan)
- **FTP/SFTP client** or cPanel File Manager access
- **MySQL database** created in cPanel (note the credentials)
- **Node.js version**: Your hosting should support Node.js 18+ (check in cPanel → Setup Node.js App)

## Step 1: Prepare Your Local Environment

### 1.1 Build the TypeScript Project

```bash
cd backend
npm run build
```

This creates the `dist/` folder with compiled JavaScript files.

### 1.2 Create Production Environment File

Create a `.env.production` file with production values:

```env
# Database
DB_HOST=localhost
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_NAME=your_db_name

# JWT
JWT_SECRET=your_strong_secret_key_here

# Email (SMTP)
EMAIL_HOST=smtp.your-email-provider.com
EMAIL_PORT=587
EMAIL_USER=your-email@example.com
EMAIL_PASSWORD=your-email-password

# App
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com
```

### 1.3 Copy Production Environment

After building, rename `.env.production` to `.env` for the production build:

```bash
cp .env.production .env
```

## Step 2: Prepare Files for Upload

### 2.1 Required Files to Upload

- All files in `dist/` folder
- `app.js` (startup file for cPanel)
- `package.json`
- `package-lock.json`
- `.env` (production version)
- `nga_central_mis.sql` (database schema)

### 2.2 Exclude from Upload

- `node_modules/` (will be installed on server)
- `src/` (source code, already compiled)
- `*.log` files
- `.env.production` (not needed on server)

## Step 3: Upload to cPanel

### 3.1 Using File Manager

1. Log in to Namecheap cPanel
2. Go to **File Manager**
3. Navigate to your domain's root directory (usually `public_html/` or create a subfolder like `api/`)
4. Upload all required files

### 3.2 Using FTP/SFTP

1. Connect to your hosting via FTP/SFTP
2. Upload files to the appropriate directory
3. Set file permissions: `package.json` and `.env` should be `644`

## Step 4: Set Up Node.js Application in cPanel

### 4.1 Create Node.js Application

1. In cPanel, go to **Setup Node.js App** (under Software)
2. Click **Create Application**
3. Configure:
   - **Node.js Version**: Select 18.x or 20.x (latest stable)
   - **Application Mode**: Production
   - **Application Root**: `/public_html/your-api-folder` (or your chosen path)
   - **Application URL**: Your domain or subdomain
   - **Application Startup File**: `app.js` (I've created this in the backend folder - it loads the compiled dist folder)

### 4.2 Install Dependencies

1. In the Node.js App settings, click **Run NPM Install**
2. Wait for installation to complete

### 4.3 Set Environment Variables

⚠️ **DO NOT use .htaccess for environment variables** - LiteSpeed doesn't support SetEnv for Node.js apps.

**Use the cPanel Node.js App settings instead:**

1. Go to **Setup Node.js App**
2. Click **Edit** on your app
3. Scroll to **Environment Variables** section
4. Add each variable one by one:
   - Click **Add Variable** for each key-value pair
   - Example:
     - **Name**: `DB_HOST` → **Value**: `localhost`
     - **Name**: `DB_USER` → **Value**: `your_db_username`
     - **Name**: `DB_PASSWORD` → **Value**: `your_db_password`
     - **Name**: `DB_NAME` → **Value**: `your_db_name`
     - **Name**: `JWT_SECRET` → **Value**: `your_strong_secret_key`
     - **Name**: `EMAIL_HOST` → **Value**: `smtp.example.com`
     - **Name**: `EMAIL_PORT` → **Value**: `587`
     - **Name**: `EMAIL_USER` → **Value**: `your-email@example.com`
     - **Name**: `EMAIL_PASSWORD` → **Value**: `your-email-password`
     - **Name**: `PORT` → **Value**: `3000`
     - **Name**: `NODE_ENV` → **Value**: `production`
     - **Name**: `FRONTEND_URL` → **Value**: `https://your-domain.com`
5. Click **Save** at the bottom
6. **Restart the app** for changes to take effect

### 4.4 Start the Application

1. Click **Start App** in the Node.js App settings
2. Check the logs for any errors

## Step 5: Set Up Database

### 5.1 Create MySQL Database

1. In cPanel, go to **MySQL Database Wizard**
2. Create a new database (e.g., `username_appdb`)
3. Create a database user with a strong password
4. Add user to database with all privileges

### 5.2 Import Database Schema

1. Go to **phpMyAdmin** in cPanel
2. Select your database
3. Go to **Import** tab
4. Upload `nga_central_mis.sql`
5. Click **Go** to import

## Step 6: Configure Domain/Subdomain (Optional)

If using a subdomain (e.g., `api.yourdomain.com`):

1. Go to **Domains** in cPanel
2. Click **Create A New Domain** or **Subdomain**
3. Point document root to your API folder
4. The Node.js app will automatically use this subdomain

## Step 7: Test Your API

Once deployed, test your endpoints:

```bash
curl https://your-api-domain.com/health
```

Expected response:

```json
{
  "status": "OK",
  "message": "Server is running"
}
```

## Step 8: Troubleshooting

### 8.1 Check Logs

- Go to **Setup Node.js App** → **Logs**
- Check for error messages

### 8.2 Common Issues

**ERROR: SyntaxError: Unexpected token export**

This error occurs when Node.js version is too old (below 14). drizzle-orm requires Node.js 18+.

**Solution:**

1. Go to **Setup Node.js App** in cPanel
2. Stop the current app
3. Change **Node.js Version** to **18.x** or **20.x** (NOT 10.x)
4. Click **Run NPM Install** again
5. Start the app

**Port Already in Use:**

- Stop the app, wait 30 seconds, restart

**Module Not Found:**

- Run `npm install` again in cPanel

**Database Connection Failed:**

- Verify database credentials in environment variables
- Ensure database user has proper permissions

**502 Bad Gateway:**

- Check if app started successfully
- Verify startup file path is correct

### 8.3 Restart Application

1. Go to **Setup Node.js App**
2. Click **Stop App**, wait 5 seconds
3. Click **Start App**
4. Check logs for errors

## Important Notes

- **Node.js must be enabled** on your hosting plan (check with Namecheap support if not visible)
- **Cron jobs** can be set up for maintenance tasks if needed
- **SSL certificates** are free with Namecheap's AutoSSL (enable in SSL/TLS section)
- **Backup** your database regularly using cPanel's Backup feature

## Quick Deployment Checklist

- [ ] Build TypeScript: `npm run build`
- [ ] Create production `.env` file
- [ ] Upload files to cPanel (exclude `node_modules`, `src`)
- [ ] Create MySQL database and import schema
- [ ] Create Node.js app in cPanel
- [ ] Run `npm install` in cPanel
- [ ] Set environment variables
- [ ] Start the application
- [ ] Test API endpoints
- [ ] Configure domain/subdomain
- [ ] Enable SSL certificate

## Support

- Namecheap Support: Available 24/7 via live chat
- Node.js Documentation: nodejs.org
- cPanel Documentation: docs.cpanel.net
