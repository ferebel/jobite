# AI-Powered Job Search and CV Tailoring App

## Overview

This application is designed to assist DWP (Department for Work and Pensions) Work Coaches in supporting customers, particularly those with low digital skills, to find employment. It provides tools for managing customer caseloads, handling CVs, searching for job opportunities, and leveraging AI to tailor CVs for specific job applications.

## Features

*   **Secure Work Coach Login:** Authentication is handled via Supabase Auth.
*   **Customer Caseload Management:** Full CRUD (Create, Read, Update, Delete) operations for managing customer details.
*   **CV Upload and Parsing:** Supports `.pdf`, `.docx`, and `.txt` CV uploads. The content is parsed and stored for each customer.
*   **Job Search Functionality:**
    *   Generates direct search links for major job boards (Indeed, LinkedIn, MyJobScotland).
    *   Includes a placeholder for future integration with the DWP "Find a Job" API.
*   **AI-Powered CV Tailoring:**
    *   Utilizes the Google Gemini API (gemini-pro model) to tailor a customer's parsed CV content to a specific job description.
    *   The AI aims to highlight relevant skills, integrate keywords, use action verbs, and suggest quantifiable achievements.
*   **CV Management:**
    *   View parsed CV text.
    *   View AI-tailored CV text (formatted in Markdown).
    *   Copy tailored CV text to clipboard.
    *   Download tailored CV as a `.md` (Markdown) file.
*   **UI/UX and Accessibility:** Includes enhancements for better user experience and accessibility, such as ARIA attributes, focus management, and user-friendly feedback messages.

## Technology Stack

*   **Frontend:** Vanilla JavaScript, HTML, CSS.
    *   *Hosting:* Designed to be deployed on Cloudflare Pages.
*   **Backend:** Cloudflare Workers (TypeScript).
*   **Database & Storage:** Supabase (PostgreSQL for database, Supabase Storage for CV files).
*   **Authentication:** Supabase Auth.
*   **AI:** Google Gemini API (specifically the `gemini-pro` model).

## Setup for Local Development (Conceptual)

*   **Frontend (`frontend/`):**
    *   The HTML, CSS, and JavaScript files in the `frontend/` directory can be served by any local static web server (e.g., Live Server in VS Code, `python -m http.server`).
    *   **Important:** You'll need to manually replace the placeholder `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `frontend/app.js` with your actual Supabase credentials.
    *   You will also need to update the API fetch paths in `frontend/app.js` to point to your local Cloudflare Worker instance (e.g., `http://localhost:8787/api/...` if your worker is served on port 8787 and routes start with `/api`).
*   **Backend (`backend/`):**
    *   Requires Node.js and npm.
    *   Uses Cloudflare's `wrangler` CLI for local development and deployment.
    *   Install wrangler: `npm install -g wrangler`
    *   Run locally: `wrangler dev` (from within the `backend/` directory). This typically serves the worker on `http://localhost:8787`.
    *   A Supabase project must be set up and its credentials configured for the worker (see environment variables).
*   **Supabase:**
    *   A live Supabase project is required for database, storage, and authentication functionalities. The backend worker interacts directly with Supabase.

## Required Environment Variables (for Cloudflare Worker)

These variables need to be configured as secrets for your deployed Cloudflare Worker:

*   `SUPABASE_URL`: Your Supabase project URL.
*   `SUPABASE_ANON_KEY`: Your Supabase project's `anon` (public) key.
*   `GEMINI_API_KEY`: Your API key for the Google Gemini service.
*   `DWP_API_KEY`: (Optional for now) Your API key for the DWP "Find a Job" service. The integration is currently a placeholder. Set to "NOT_CONFIGURED" or similar if not using.
*   `CV_BUCKET_NAME`: (Optional) The name of your Supabase storage bucket for CVs. Defaults to `cvs` in the code if not set.

## AI CV Tailoring Logic

The AI-powered CV tailoring feature works as follows:

1.  The system retrieves the customer's most recently uploaded and parsed CV text.
2.  The Work Coach provides a job description (and optionally a job title and company name) for the role the customer is applying for.
3.  A detailed prompt is constructed. This prompt includes:
    *   The customer's name.
    *   The full original (parsed) CV text.
    *   Any relevant notes associated with the customer.
    *   The full job description, title, and company.
    *   Specific instructions for the AI (Gemini `gemini-pro` model) to:
        *   Act as an expert CV tailoring assistant.
        *   Rewrite the CV to highlight skills and experiences relevant to the job.
        *   Integrate keywords from the job description naturally.
        *   Use strong action verbs.
        *   Maintain a professional, clear, and concise tone.
        *   Suggest quantifiable achievements where appropriate (e.g., "[Consider quantifying this achievement, e.g., 'Increased X by Y%']").
        *   Format the entire output as a complete tailored CV in Markdown.
4.  This prompt is sent to the Google Gemini API.
5.  The API's response (the tailored CV text in Markdown) is then displayed to the Work Coach.

## Known Limitations / Future Improvements

*   **DWP "Find a Job" API:** The integration is currently a placeholder. To make it functional, the `searchDwpFindAJob` function in `backend/index.ts` needs to be implemented with live API calls, and a valid `DWP_API_KEY` must be configured.
*   **`.doc` File Parsing:** The application uses libraries that primarily support `.docx`, `.pdf`, and `.txt`. Parsing for older `.doc` files is limited; users are advised to convert such files to a supported format.
*   **Tailored CV Download Format:** Tailored CVs are currently downloadable as `.md` (Markdown) files. Future enhancements could include direct download to `.docx` or `.pdf` using client-side or server-side conversion libraries.
*   **Job Search Aggregation:** The job search feature currently generates links to external job boards. Directly aggregating job listings from these platforms into the app is complex and would require specific API access and parsing for each job board.
*   **Automated Tests:** The project currently lacks a comprehensive suite of automated tests. Adding unit, integration, and end-to-end tests would improve code quality and maintainability.
*   **Advanced CV Parsing:** While text is extracted, further NLP processing (e.g., entity recognition for skills, experience sections) could enhance CV-related features.
*   **Scalability for Large Caseloads:** For very large numbers of customers or CVs, performance optimizations (e.g., pagination, more optimized queries) might be necessary.
*   **UI Refinements:** Further UI/UX enhancements based on Work Coach feedback could be implemented.

---
This README provides a comprehensive overview of the application.
