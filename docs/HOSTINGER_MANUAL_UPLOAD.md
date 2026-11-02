# Deploy GCS CONNECT as a Hostinger Node.js Web App

## Build the upload archive

From the project root, run:

```bash
npm run package:hostinger
```

Upload `dist/hostinger-upload.zip` through Hostinger’s **Web App → Upload your website files** deployment flow. Do not extract it into `public_html` using File Manager. `public_html` is the web server’s static document root; extracting a Node app there does not start `server.js`, and a directory without an index file can return 403. Hostinger’s Web App deployment creates the Node.js runtime and its routing configuration.

## Hostinger deployment settings

1. In hPanel, open **Websites → Create site → Web App → Upload your website files** and upload the ZIP.
2. Choose the detected **Next.js** framework. If Hostinger requests an entry file, use `server.js`. Keep the generated `.next` directory inside the app; it is not a public output directory.
3. Select Node.js 22.12+ (recommended) or 20.19+. The upgraded Vite toolchain requires one of those minimum versions. Hostinger currently offers Node.js Web Apps on Business/Cloud plans; VPS deployments require manual setup.
4. Add the following environment variables in the Node.js app dashboard, replacing placeholders:

   ```ini
   NODE_ENV=production
   HOST=0.0.0.0
   NEXT_PUBLIC_APP_URL=https://your-domain.example
   DATABASE_URL=mysql://DB_USER:DB_PASSWORD@DB_HOST:3306/DB_NAME
   JWT_SECRET=<unique random secret of at least 32 characters>
   COOKIE_SECURE=true
   SESSION_COOKIE_NAME=gcs_session
   ADMIN_INITIAL_EMAIL=admin@your-domain.example
   ADMIN_INITIAL_PASSWORD=<unique strong password>
   ADMIN_INITIAL_NAME=Site Administrator
   ```

   Generate a secret with `openssl rand -base64 48`. Keep it private. The first administrator is created at startup only if that email does not already exist.

5. Deploy and review the deployment log. If Hostinger asks for build settings, use `npm install` for install and `npm run build` for build; use `npm start` to start the server if a start command is requested.
6. Create the MySQL database and user in hPanel, then run `npx prisma db push` in the app environment if the deployment workflow provides a terminal. Otherwise run it from the deployment build command after configuring `DATABASE_URL`.
7. Use the Node.js app dashboard’s **Restart** control, then visit `https://your-domain.example/api/health`.

If your domain is currently serving a different website, confirm how Hostinger will attach the Web App to the domain before replacing that site. Hostinger’s deployment system manages the live routing file in `public_html`; do not replace it with the project’s local `.htaccess` file.
