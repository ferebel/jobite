import { IttyRouter, Router, error, json, status } from 'itty-router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js'; // Using the specific path for potentially better tree-shaking or worker compatibility

// Define a type for the environment variables
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  // Ensure your worker environment has access to the 'cvs' bucket name if needed, or hardcode
  CV_BUCKET_NAME?: string;
  DWP_API_KEY?: string; // For DWP Find a Job API (placeholder for now)
  GEMINI_API_KEY?: string; // For Google Gemini API
}

// Define a type for the user object we expect from Supabase
interface AuthenticatedUser {
  id: string;
  // Add other user properties if needed
}

// Define a type for the request object, extended with user information
interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  supabase?: SupabaseClient;
}

// Middleware to initialize Supabase client and attach to request
const withSupabase = (request: AuthenticatedRequest, env: Env) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.error('Supabase URL or Anon Key not defined in environment variables.');
    return error(500, 'Supabase configuration error.');
  }
  request.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
};

// Authentication Middleware
const withAuth = async (request: AuthenticatedRequest, env: Env) => {
  if (!request.supabase) {
    // This should not happen if withSupabase runs first
    return error(500, 'Supabase client not initialized.');
  }
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(401, 'Missing or invalid Authorization header.');
  }
  const jwt = authHeader.substring(7); // Remove "Bearer " prefix
  const { data: { user }, error: authError } = await request.supabase.auth.getUser(jwt);

  if (authError || !user) {
    return error(401, 'Invalid or expired token.');
  }
  request.user = { id: user.id }; // Attach user to the request
};


const router = IttyRouter();

// Register Supabase initialization middleware for all routes
router.all('*', withSupabase);

// --- Caseload Management API Endpoints ---

// POST /api/customers - Create a new customer
router.post('/api/customers', withAuth, async (request: AuthenticatedRequest) => {
  if (!request.user || !request.supabase) return error(500, 'Server error.');
  
  let customerData;
  try {
    customerData = await request.json();
  } catch (err) {
    return error(400, 'Invalid JSON in request body.');
  }

  const { name, email, phone, notes } = customerData;

  if (!name) {
    return error(400, 'Missing required field: name.');
  }

  const work_coach_id = request.user.id;

  const { data, error: dbError } = await request.supabase
    .from('customers')
    .insert([{ work_coach_id, name, email, phone, notes }])
    .select()
    .single(); // Assuming you want to return the created object

  if (dbError) {
    console.error('Supabase insert error:', dbError);
    return error(500, `Failed to create customer: ${dbError.message}`);
  }
  return json(data, { status: 201 });
});

// GET /api/customers - Get all customers for the authenticated work coach
router.get('/api/customers', withAuth, async (request: AuthenticatedRequest) => {
  if (!request.user || !request.supabase) return error(500, 'Server error.');
  
  const work_coach_id = request.user.id;

  const { data, error: dbError } = await request.supabase
    .from('customers')
    .select('*')
    .eq('work_coach_id', work_coach_id);

  if (dbError) {
    console.error('Supabase select error:', dbError);
    return error(500, `Failed to fetch customers: ${dbError.message}`);
  }
  return json(data);
});

// GET /api/customers/:id - Get a specific customer by ID
router.get('/api/customers/:id', withAuth, async (request: AuthenticatedRequest) => {
  if (!request.user || !request.supabase) return error(500, 'Server error.');

  const customerId = request.params?.id;
  if (!customerId) {
    return error(400, 'Customer ID missing from URL.');
  }
  
  const work_coach_id = request.user.id;

  const { data, error: dbError } = await request.supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('work_coach_id', work_coach_id) // RLS should also enforce this, but good for clarity
    .single();

  if (dbError) {
    // Error could be due to RLS or actual DB error.
    // If it's a 'PGRST116' (PostgREST error for 0 rows), it's a 404.
    if (dbError.code === 'PGRST116') {
        return error(404, 'Customer not found or not owned by this work coach.');
    }
    console.error('Supabase select single error:', dbError);
    return error(500, `Failed to fetch customer: ${dbError.message}`);
  }
  if (!data) { // Should be caught by PGRST116, but as a fallback
      return error(404, 'Customer not found or not owned by this work coach.');
  }
  return json(data);
});

// PUT /api/customers/:id - Update a customer by ID
router.put('/api/customers/:id', withAuth, async (request: AuthenticatedRequest) => {
  if (!request.user || !request.supabase) return error(500, 'Server error.');

  const customerId = request.params?.id;
  if (!customerId) {
    return error(400, 'Customer ID missing from URL.');
  }

  let updates;
  try {
    updates = await request.json();
  } catch (err) {
    return error(400, 'Invalid JSON in request body.');
  }

  // Ensure work_coach_id is not being maliciously updated
  delete updates.work_coach_id;
  updates.updated_at = new Date().toISOString(); // Manually set updated_at

  const work_coach_id = request.user.id;

  const { data, error: dbError, count } = await request.supabase
    .from('customers')
    .update(updates)
    .eq('id', customerId)
    .eq('work_coach_id', work_coach_id) // Ensure user owns the record
    .select()
    .single();

  if (dbError) {
    console.error('Supabase update error:', dbError);
    // PGRST116 can also mean 0 rows were updated, which implies not found or not owned
    if (dbError.code === 'PGRST116' || count === 0) {
         return error(404, 'Customer not found or not owned by this work coach for update.');
    }
    return error(500, `Failed to update customer: ${dbError.message}`);
  }
   if (!data && count === 0) { // If no error but data is null and count is 0
    return error(404, 'Customer not found or not owned by this work coach for update.');
  }
  return json(data);
});

// DELETE /api/customers/:id - Delete a customer by ID
router.delete('/api/customers/:id', withAuth, async (request: AuthenticatedRequest) => {
  if (!request.user || !request.supabase) return error(500, 'Server error.');
  
  const customerId = request.params?.id;
  if (!customerId) {
    return error(400, 'Customer ID missing from URL.');
  }
  
  const work_coach_id = request.user.id;

  const { error: dbError, count } = await request.supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('work_coach_id', work_coach_id); // Ensure user owns the record

  if (dbError) {
    console.error('Supabase delete error:', dbError);
    return error(500, `Failed to delete customer: ${dbError.message}`);
  }

  if (count === 0) {
    return error(404, 'Customer not found or not owned by this work coach for deletion.');
  }

  return status(204); // No Content
});


// POST /api/customers/:customerId/cv - Upload and parse CV
router.post('/api/customers/:customerId/cv', withAuth, async (request: AuthenticatedRequest, env: Env) => {
  if (!request.user || !request.supabase) return error(500, 'Server error: User or Supabase client missing.');

  const customerId = request.params?.customerId;
  if (!customerId) {
    return error(400, 'Customer ID missing from URL.');
  }

  const work_coach_id = request.user.id;
  const supabase = request.supabase;
  const cvBucketName = env.CV_BUCKET_NAME || 'cvs'; // Default to 'cvs'

  // 1. Verify customer ownership
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, work_coach_id')
    .eq('id', customerId)
    .eq('work_coach_id', work_coach_id)
    .single();

  if (customerError || !customer) {
    return error(404, 'Customer not found or not owned by this work coach.');
  }

  // 2. Process FormData for file
  let file: File;
  let originalFilename: string;
  let mimeType: string;

  try {
    const formData = await request.formData();
    const cvFile = formData.get('cv');
    if (!(cvFile instanceof File)) {
      return error(400, 'CV file not provided or invalid format in FormData (expected a File object under key "cv").');
    }
    file = cvFile;
    originalFilename = file.name;
    mimeType = file.type || 'application/octet-stream'; // Default MIME type if not provided
  } catch (err) {
    console.error('Error processing FormData:', err);
    return error(400, 'Invalid FormData or missing CV file.');
  }

  // 3. Upload to Supabase Storage
  const storagePath = `${work_coach_id}/${customerId}/${Date.now()}_${originalFilename}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(cvBucketName)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: true, // Overwrite if file with same path exists
    });

  if (uploadError) {
    console.error('Supabase storage upload error:', uploadError);
    return error(500, `Failed to upload CV: ${uploadError.message}`);
  }

  const uploadedPath = uploadData.path; // path from storage response

  // 4. Parse CV
  let parsedText = null;
  let parsingErrorMessage = null;
  try {
    const fileBuffer = await file.arrayBuffer();

    if (mimeType === 'application/pdf' || originalFilename.toLowerCase().endsWith('.pdf')) {
      const pdfData = await pdf(fileBuffer);
      parsedText = pdfData.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || originalFilename.toLowerCase().endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ arrayBuffer: fileBuffer });
      parsedText = value;
    } else if (mimeType === 'text/plain' || originalFilename.toLowerCase().endsWith('.txt')) {
      parsedText = new TextDecoder().decode(fileBuffer);
    } else if (originalFilename.toLowerCase().endsWith('.doc')) {
      parsedText = "'.doc' files are not automatically parsable by this system. Please convert to .docx, .pdf, or .txt and re-upload.";
      parsingErrorMessage = parsedText; // Store this specific message
    } else {
      parsingErrorMessage = `Unsupported file type: ${mimeType || originalFilename}. Cannot parse.`;
      parsedText = `File type ${mimeType || originalFilename} is not supported for parsing.`;
    }
  } catch (parseError: any) {
    console.error(`Error parsing CV (${mimeType || originalFilename}):`, parseError);
    parsingErrorMessage = `Failed to parse CV: ${parseError.message || 'Unknown parsing error'}.`;
    parsedText = `Error during parsing: ${parseError.message || 'File content could not be extracted.'}`;
  }

  // 5. Update Customer Record
  const customerUpdate = {
    cv_original_filename: originalFilename,
    cv_storage_path: uploadedPath,
    cv_mime_type: mimeType,
    cv_last_uploaded_at: new Date().toISOString(),
    cv_parsed_text: parsedText,
    updated_at: new Date().toISOString(), // Also update the general updated_at
  };

  const { data: updatedCustomer, error: dbUpdateError } = await supabase
    .from('customers')
    .update(customerUpdate)
    .eq('id', customerId)
    .eq('work_coach_id', work_coach_id) // Double check ownership for update
    .select('id, cv_original_filename, cv_mime_type, cv_last_uploaded_at, cv_parsed_text') // Select relevant fields
    .single();

  if (dbUpdateError) {
    console.error('Supabase DB update error:', dbUpdateError);
    // Attempt to delete the uploaded file if DB update fails to prevent orphaned files
    await supabase.storage.from(cvBucketName).remove([uploadedPath]);
    return error(500, `Failed to update customer record with CV details: ${dbUpdateError.message}`);
  }

  return json({
    message: parsingErrorMessage ? `CV uploaded, but with parsing issues: ${parsingErrorMessage}` : 'CV uploaded and parsed successfully.',
    customer: updatedCustomer,
    storagePath: uploadedPath,
    parsedTextSnippet: parsedText ? parsedText.substring(0, 200) + (parsedText.length > 200 ? '...' : '') : null
  }, { status: parsingErrorMessage ? 202 : 200 }); // 202 Accepted if there was a parsing issue
});


// --- Job Search API Endpoint ---

// Placeholder function for DWP Find a Job API
async function searchDwpFindAJob(keywords: string, location: string, radius: number, apiKey?: string): Promise<any[]> {
  // TODO: Implement when user provides API details and DWP Find a Job API endpoint.
  // This function would make a fetch request to the actual DWP API.
  // The DWP_API_KEY environment variable should be set in the Cloudflare Worker.
  //
  // Expected structure for each job object returned by DWP API (this is a hypothetical example):
  // {
  //   id: string;        // Unique identifier for the job
  //   title: string;       // Job title
  //   companyName: string; // Name of the employer
  //   location: string;    // Job location (e.g., city, postcode)
  //   description: string; // A brief job description or snippet
  //   url: string;         // A direct URL to the job posting on DWP or partner site
  //   postedDate?: string;  // Optional: when the job was posted (e.g., "2023-10-26T10:00:00Z")
  //   salary?: string;      // Optional: salary information (e.g., "£30,000 - £35,000 per annum")
  // }
  //
  // Example usage:
  // if (!apiKey) {
  //   console.warn("DWP_API_KEY not configured. Skipping DWP job search.");
  //   return [];
  // }
  // const dwpApiBaseUrl = "https://api.example.dwp.gov.uk/find-a-job"; // Replace with actual API base URL
  // const queryParams = new URLSearchParams({
  //   keywords: keywords,
  //   locationName: location, // Parameter names might vary
  //   distance: radius.toString(), // Parameter names might vary
  //   // Add other necessary parameters like page, resultsPerPage, etc.
  // });
  // const fullUrl = `${dwpApiBaseUrl}/search?${queryParams.toString()}`;
  //
  // try {
  //   const response = await fetch(fullUrl, {
  //     method: 'GET',
  //     headers: {
  //       'Authorization': `Bearer ${apiKey}`, // Or other auth mechanism like 'Ocp-Apim-Subscription-Key'
  //       'Accept': 'application/json'
  //     }
  //   });
  //
  //   if (!response.ok) {
  //     console.error("DWP API request failed:", response.status, await response.text());
  //     return []; // Return empty or throw an error based on desired handling
  //   }
  //
  //   const data = await response.json();
  //   // Adapt this based on the actual API response structure
  //   // For example, if jobs are in data.results or data.jobs_list
  //   return data.jobs || []; 
  // } catch (error) {
  //   console.error("Error calling DWP API:", error);
  //   return [];
  // }

  console.log(`Placeholder: DWP Find a Job search for keywords: "${keywords}", location: "${location}", radius: ${radius} miles. API Key present: ${!!apiKey}`);
  return []; // Return empty array for now
}

router.post('/api/job-search', withAuth, async (request: AuthenticatedRequest, env: Env) => {
  if (!request.user || !request.supabase) return error(500, 'Server error.');

  let searchParams;
  try {
    searchParams = await request.json();
  } catch (err) {
    return error(400, 'Invalid JSON in request body.');
  }

  const { keywords, location, radius } = searchParams;

  if (!keywords || !location) {
    return error(400, 'Missing required fields: keywords and location.');
  }
  if (radius === undefined || radius === null || typeof radius !== 'number') {
    return error(400, 'Missing or invalid radius field (must be a number).');
  }


  const encodedKeywords = encodeURIComponent(keywords);
  const encodedLocation = encodeURIComponent(location);
  const encodedRadius = encodeURIComponent(radius.toString()); // Radius might be used differently by APIs

  const searchLinks = [
    {
      platform: "Indeed",
      url: `https://uk.indeed.com/jobs?q=${encodedKeywords}&l=${encodedLocation}&radius=${encodedRadius}` // Indeed uses 'radius' for miles
    },
    {
      platform: "LinkedIn",
      // LinkedIn's 'distance' parameter might be in miles or km, and might need specific values.
      // This is a common pattern but might need adjustment.
      url: `https://www.linkedin.com/jobs/search/?keywords=${encodedKeywords}&location=${encodedLocation}&distance=${encodedRadius}`
    },
    {
      platform: "MyJobScotland",
      // MyJobScotland's search parameters might be different. This is a guess.
      // They might use specific location IDs or a different radius parameter.
      url: `https://www.myjobscotland.gov.uk/search?keywords=${encodedKeywords}&location=${encodedLocation}&radius=${encodedRadius}`
    }
  ];

  // Placeholder for DWP API call
  const dwpJobs = await searchDwpFindAJob(keywords, location, radius, env.DWP_API_KEY);

  return json({
    dwpJobs: dwpJobs,
    searchLinks: searchLinks
  });
});

// --- CV Tailoring API Endpoint ---

// Placeholder function for Gemini API call
async function callGeminiApi(prompt: string, apiKey: string, customerName: string, cvParsedText: string, jobDescription: string, jobTitle?: string, jobCompany?: string): Promise<string> {
  // Log the prompt for inspection (as required)
  console.log("Gemini API Prompt:", prompt);

  // Simulate API call - DO NOT make a real HTTP request here for this step
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not configured. Returning placeholder response for CV tailoring.");
    return `
## Tailored CV for ${customerName || 'Customer'} (API Key Missing - Simulated)

**Applying for:** ${jobTitle || 'N/A'} at ${jobCompany || 'N/A'}

**Original CV Snippet (for context):**
${cvParsedText.substring(0, 200)}...

**Job Description Snippet (for context):**
${jobDescription.substring(0, 200)}...

**AI Tailoring Suggestions (Simulated - API Key Not Provided):**
- This is a placeholder response because the Gemini API key is not configured.
- Full AI tailoring will occur when connected to the Gemini API with a valid key.
- Potential actions would include:
  - Identifying keywords from the job description.
  - Emphasizing relevant skills from the original CV.
  - Rewriting sections for better alignment with the job.
  - Suggesting quantifiable achievements.
`;
  }

  // Simulated response structure if API key were present but still in placeholder mode
  return `
## Tailored CV for ${customerName || 'Customer'}

**Applying for:** ${jobTitle || 'N/A'} at ${jobCompany || 'N/A'}

**Original CV Snippet (for context):**
${cvParsedText.substring(0, 200)}...

**Job Description Snippet (for context):**
${jobDescription.substring(0, 200)}...

**AI Tailoring Suggestions (Simulated):**
- Identified keywords: Leadership, Project Management, Agile.
- Emphasized skill: Cross-functional team collaboration.
- Rewrote section: Professional Summary to align with company values.
[Consider quantifying achievement: Successfully launched 3 major projects.]

(This is a simulated response. Full AI tailoring will occur when connected to Gemini API with a valid key.)
`;
}


router.post('/api/customers/:customerId/tailor-cv', withAuth, async (request: AuthenticatedRequest, env: Env) => {
  if (!request.user || !request.supabase) return error(500, 'Server error.');

  const customerId = request.params?.customerId;
  if (!customerId) {
    return error(400, 'Customer ID missing from URL.');
  }

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (err) {
    return error(400, 'Invalid JSON in request body.');
  }

  const { jobDescription, jobTitle, jobCompany } = requestBody;

  if (!jobDescription) {
    return error(400, 'Missing required field: jobDescription.');
  }

  const work_coach_id = request.user.id;
  const supabase = request.supabase;

  // Fetch customer's parsed CV text and name
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('name, cv_parsed_text, notes') // Include notes if they might be relevant for tailoring
    .eq('id', customerId)
    .eq('work_coach_id', work_coach_id)
    .single();

  if (customerError) {
    console.error('Error fetching customer:', customerError);
    return error(500, `Failed to fetch customer data: ${customerError.message}`);
  }
  if (!customer) {
    return error(404, 'Customer not found or not owned by this work coach.');
  }

  if (!customer.cv_parsed_text) {
    return error(400, 'Customer has no parsed CV to tailor. Please upload and parse a CV first.');
  }

  // Construct the prompt for Gemini API
  const prompt = `
You are an expert CV tailoring assistant. Your task is to rewrite the following original CV content to be specifically tailored for the provided job description.

Customer Name: ${customer.name || 'N/A'}
Original CV Content:
---
${customer.cv_parsed_text}
---
${customer.notes ? `\nAdditional Notes about the customer (for context, do not include directly in CV unless relevant):\n---\n${customer.notes}\n---` : ''}

Job Description:
---
Job Title: ${jobTitle || 'Not specified'}
Company: ${jobCompany || 'Not specified'}
${jobDescription}
---

Please perform the following actions:
1. Rewrite the CV to highlight the skills and experiences most relevant to this specific job.
2. Naturally integrate keywords from the job description.
3. Use strong action verbs to describe accomplishments.
4. Maintain a professional, clear, and concise tone.
5. If there are opportunities to add quantifiable achievements, please include a suggestion in brackets, like: [Consider quantifying this achievement, e.g., 'Increased X by Y%'].
6. Format the output as a complete tailored CV using Markdown (e.g., for headings, bold text, bullet points). Do not include any introductory or conversational phrases in your response, only the tailored CV text itself.
`.trim();

  // Call the placeholder Gemini API function
  const tailoredCvText = await callGeminiApi(
    prompt, 
    env.GEMINI_API_KEY || '', // Pass empty string if undefined, function handles it
    customer.name || '',
    customer.cv_parsed_text,
    jobDescription,
    jobTitle,
    jobCompany
  );

  return json({ tailoredCvText: tailoredCvText });
});


// 404 for everything else
router.all('*', () => error(404, 'Not Found.'));

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> =>
    router.handle(request, env, ctx)
      .catch((err) => {
        // Generic error handler for errors not caught by itty-router's error()
        console.error("Unhandled error in worker:", err);
        let statusCode = 500;
        let message = 'Internal Server Error';
        if (err instanceof Error && 'status' in err) {
            statusCode = (err as any).status;
            message = err.message;
        } else if (typeof err === 'string') {
            message = err;
        }
        // Construct a new Response object for the error
        return new Response(JSON.stringify({ error: message, status: statusCode }), {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' }
        });
      }),
};
