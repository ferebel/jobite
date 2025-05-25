# Deployment Instructions for AI-Powered Job Search and CV Tailoring App

This guide provides step-by-step instructions to deploy the application.

## Section 1: Supabase Setup

1.  **Create Supabase Project:**
    *   Go to [Supabase](https://supabase.com/dashboard) and create a new project.
    *   You can select the free tier for initial setup. Note your project's region.

2.  **Run SQL Schema:**
    *   In your Supabase project dashboard, navigate to "SQL Editor" from the sidebar.
    *   Click on "+ New query".
    *   Copy the entire content of the `schema.sql` file from the project's root directory.
    *   Paste it into the query editor and click "Run".

3.  **Run SQL Migration (Alter Table):**
    *   Click on "+ New query" again.
    *   Copy the entire content of the `02_alter_customers_for_cv.sql` file from the project's root directory.
    *   Paste it into the query editor and click "Run".

4.  **Create Storage Bucket for CVs:**
    *   In your Supabase project dashboard, go to "Storage" from the sidebar.
    *   Click on "Buckets" then click the "Create new bucket" button.
    *   Name the bucket `cvs`.
    *   **Access Policy:** For simplicity during initial setup, you can make this bucket public.
        *   Click on the newly created `cvs` bucket.
        *   Go to the "Policies" tab (or click the "Edit policy" button if available directly).
        *   You might see a default policy. You can either edit it or create new ones. To make it public for SELECT (downloads) and allow authenticated uploads:
            *   **For SELECT (public access):** Create a new policy or edit an existing one for `SELECT`. Remove any existing condition or set it to `true`.
            *   **For INSERT (authenticated uploads):** Create a new policy for `INSERT`. As a basic condition, you can use `auth.uid() IS NOT NULL`. This ensures only logged-in users (via your app, which uses the anon key for user sessions) can upload.
        *   **Important Note:** Public access for the bucket is simpler for setup. For a production environment, you would need to configure more restrictive Row Level Security (RLS) policies on the bucket to ensure users can only access/upload their own data. The backend worker handles authorization for operations, but direct bucket access should also be secured.

5.  **Get API Credentials:**
    *   In your Supabase project dashboard, go to "Project Settings" (the gear icon).
    *   Navigate to "API" in the sidebar.
    *   Find and copy your **Project URL**. This will be your `SUPABASE_URL`.
    *   Find and copy your `anon` **public** key. This will be your `SUPABASE_ANON_KEY`. Keep these safe.

## Section 2: Google Gemini API Key

1.  **Obtain API Key:**
    *   Go to [Google AI Studio](https://aistudio.google.com/listing/project-apis) (or the current portal for Google Gemini API keys).
    *   Follow the instructions to create a new API key. This will be your `GEMINI_API_KEY`.
    *   Ensure the Gemini API (e.g., "Generative Language API") is enabled for your Google Cloud project associated with the API key.

## Section 3: Cloudflare Worker Deployment (Backend)

1.  **Prerequisites:**
    *   Ensure you have Node.js and npm installed on your system. You can download them from [nodejs.org](https://nodejs.org/).

2.  **Install Wrangler CLI:**
    *   Open your terminal or command prompt.
    *   Install Cloudflare's `wrangler` command-line tool globally:
        ```bash
        npm install -g wrangler
        ```

3.  **Navigate to Backend Directory:**
    *   In your terminal, change to the `backend/` directory of your project:
        ```bash
        cd path/to/your/project/backend
        ```

4.  **Login to Cloudflare:**
    *   Authorize wrangler with your Cloudflare account:
        ```bash
        wrangler login
        ```
    *   This will usually open a browser window for you to log in.

5.  **Set Worker Secrets:**
    *   These commands store your sensitive keys securely in Cloudflare, accessible by your worker. Replace placeholders with your actual copied values.
        ```bash
        wrangler secret put SUPABASE_URL
        # (Paste your Supabase URL when prompted)

        wrangler secret put SUPABASE_ANON_KEY
        # (Paste your Supabase anon key when prompted)

        wrangler secret put GEMINI_API_KEY
        # (Paste your Gemini API key when prompted)

        wrangler secret put DWP_API_KEY
        # (You can put a placeholder like "NOT_CONFIGURED" if you don't have one yet)
        
        # Optional: If you named your CV bucket differently or want to be explicit
        # wrangler secret put CV_BUCKET_NAME
        # (Paste your CV bucket name, e.g., "cvs", when prompted)
        ```

6.  **Configure `wrangler.toml`:**
    *   Ensure the `backend/wrangler.toml` file exists. A basic version is provided in the project.
    *   Open `backend/wrangler.toml`. It should look similar to this (adjust `name` and `compatibility_date` as needed):
        ```toml
        name = "dwp-job-app-backend" # Choose a unique name for your worker
        main = "index.ts"           # If your entry file is index.ts in the root of backend/
                                    # If it's in backend/src/index.ts, use "src/index.ts"
        compatibility_date = "2024-03-20" # Use a recent date or the date wrangler suggests
        
        # [vars]
        # CV_BUCKET_NAME = "cvs" # Example if not using secrets for this, but secrets are preferred
        ```
    *   **Note:** The `main` field should point to your worker's entry script (e.g., `index.ts` or `src/index.ts`). The provided project structure assumes `index.ts` is in the root of the `backend/` directory. Update `compatibility_date` to a recent date.

7.  **Deploy the Worker:**
    *   From within the `backend/` directory, run:
        ```bash
        wrangler deploy
        ```
    *   After successful deployment, wrangler will output the URL of your deployed worker (e.g., `https://dwp-job-app-backend.yourusername.workers.dev`). **Copy this worker URL.**

## Section 4: Cloudflare Pages Deployment (Frontend)

1.  **Prepare Your Code:**
    *   **Replace Placeholders in `frontend/app.js`:**
        *   Open `frontend/app.js` in your code editor.
        *   At the top of the file, replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with the actual Supabase Project URL and `anon` public key you copied in Section 1.
        ```javascript
        // Example:
        // const SUPABASE_URL = 'https://abcdefghij.supabase.co'; 
        // const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
        ```
    *   **Update API Fetch Paths in `frontend/app.js`:**
        *   You now need to tell your frontend where your backend worker is deployed.
        *   Search for all instances of `fetch('/api/...` in `frontend/app.js`.
        *   Replace the relative path `/api/` with the full URL of your deployed worker (from Step 3.7), ensuring the `/api/...` part remains.
        *   **Example:** If your worker URL is `https://dwp-job-app-backend.myuser.workers.dev`, change:
            *   `fetch('/api/customers'` to `fetch('https://dwp-job-app-backend.myuser.workers.dev/api/customers'`
            *   And similarly for all other API endpoints (`/api/job-search`, `/api/customers/:id/cv`, etc.).

2.  **Push to Git Repository:**
    *   Create a new repository on a Git provider like GitHub, GitLab, or Bitbucket.
    *   Initialize a Git repository in your project's root folder if you haven't already (`git init`).
    *   Add all your project files (`git add .`).
    *   Commit your changes (`git commit -m "Initial project setup"`).
    *   Add the remote repository URL (`git remote add origin <your-repo-url>`).
    *   Push your code (`git push -u origin main` or `git push -u origin master`).

3.  **Deploy to Cloudflare Pages:**
    *   In your Cloudflare dashboard, navigate to "Workers & Pages".
    *   Click on "Create application", then select the "Pages" tab.
    *   Click "Connect to Git".
    *   Choose the Git provider where you pushed your repository and select your repository.
    *   In the "Set up builds and deployments" section:
        *   **Project name:** Choose a name for your Pages project.
        *   **Production branch:** Select your main branch (e.g., `main` or `master`).
        *   **Build settings:**
            *   Framework preset: Select "None" or "Static HTML".
            *   Build command: You can leave this blank, or use a simple command like `echo "No build needed"`.
            *   Build output directory: Set this to `frontend` (since your `index.html` is in the `frontend/` directory).
        *   **Environment Variables (Advanced):**
            *   For this specific project setup (where Supabase keys are hardcoded into `app.js` before deployment and API URLs are full paths), you typically do not need to set `SUPABASE_URL` or `SUPABASE_ANON_KEY` as Pages environment variables for the *runtime* of the frontend JavaScript. The placeholders in `app.js` should have been replaced by now. These variables are more relevant if you were using a build process with Pages to inject them.

4.  **Save and Deploy:**
    *   Click "Save and Deploy".
    *   Cloudflare Pages will build and deploy your site. You'll be given a URL for your live frontend application (e.g., `https://your-pages-project.pages.dev`).

## Section 5: Final Checks

1.  **Test Application:** Open your deployed Cloudflare Pages URL in a browser.
    *   Test user login.
    *   Test all CRUD operations for customers.
    *   Test CV upload and parsing.
    *   Test job search link generation.
    *   Test AI CV tailoring.
2.  **Worker Invocation:** Ensure there are no CORS errors in the browser console and that the frontend is successfully making requests to your Cloudflare Worker backend URL.
3.  **Check Worker Logs:** If you encounter backend issues, check the logs for your deployed worker in the Cloudflare dashboard ("Workers & Pages" -> select your worker -> "Logs").

You should now have a fully deployed application!
