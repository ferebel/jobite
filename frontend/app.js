// --- Supabase Initialization ---
// Replace with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; 
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
let supabase;

try {
    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient === 'undefined') {
        console.error('Supabase client not loaded. Make sure the CDN link is correct in index.html.');
        alert('Error: Supabase client not found. Please check console.');
    } else {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.error('Error initializing Supabase client:', e);
    alert('Failed to initialize Supabase. Check console for details.');
}


// --- DOM Selectors ---
const loginSection = document.getElementById('login-section');
const caseloadSection = document.getElementById('caseload-section');
const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');

const logoutButton = document.getElementById('logout-button');
const caseloadMessage = document.getElementById('caseload-message');

const customerFormArea = document.getElementById('customer-form-area');
const customerForm = document.getElementById('customer-form');
const customerIdInput = document.getElementById('customer-id');
const customerNameInput = document.getElementById('customer-name');
const customerEmailInput = document.getElementById('customer-email');
const customerPhoneInput = document.getElementById('customer-phone');
const customerNotesInput = document.getElementById('customer-notes');
const saveCustomerButton = document.getElementById('save-customer-button');
const clearFormButton = document.getElementById('clear-form-button');

const customerListArea = document.getElementById('customer-list-area');
const customerListUl = document.getElementById('customer-list');
const noCustomersMessage = document.getElementById('no-customers-message');

// CV Modal elements
const cvTextModal = document.getElementById('cv-text-modal');
const cvParsedTextContent = document.getElementById('cv-parsed-text-content');
const cvModalCloseButton = document.querySelector('#cv-text-modal .close-button'); // For original CV modal

// Tailored CV Modal Elements
const tailoredCvModal = document.getElementById('tailored-cv-modal');
const tailoredCvOutput = document.getElementById('tailored-cv-output');
const closeTailoredCvModalButton = document.getElementById('close-tailored-cv-modal-button');
const copyTailoredCvButton = document.getElementById('copy-tailored-cv-button');
const downloadMdButton = document.getElementById('download-md-button');

// Job Search Elements
const jobSearchSection = document.getElementById('job-search-section');
const jobSearchForm = document.getElementById('job-search-form');
const jobSearchKeywordsInput = document.getElementById('job-search-keywords');
const jobSearchLocationInput = document.getElementById('job-search-location');
const jobSearchRadiusInput = document.getElementById('job-search-radius');
const jobSearchButton = document.getElementById('job-search-button');
const jobSearchResultsDiv = document.getElementById('job-search-results');
const jobSearchMessage = document.getElementById('job-search-message');


// --- State Management ---
let currentUser = null;
let currentSession = null;
let customers = [];
let editingCustomerId = null; // This will serve as currentCustomerId for CV tailoring
let currentTailoredCvText = ''; // To store the tailored CV text for copy/download

// --- API Helper ---
async function authenticatedFetch(url, options = {}) {
async function authenticatedFetch(url, options = {}) {
    if (!currentSession || !currentSession.access_token) {
        console.warn('No active session, redirecting to login.');
        showLoginView();
        return Promise.reject(new Error('User not authenticated.'));
    }

    const defaultHeaders = {
        'Authorization': `Bearer ${currentSession.access_token}`,
    };

    if (!(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }
    
    const headers = { ...defaultHeaders, ...options.headers };

    try {
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            console.warn('Unauthorized (401) response, logging out.');
            await handleLogout();
            showLoginView();
            caseloadMessage.textContent = 'Your session has expired. Please login again.';
            caseloadMessage.className = 'error-message';
            return Promise.reject(new Error('Unauthorized. Session may have expired.'));
        }
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: response.statusText || 'Unknown server error' };
            }
            console.error(`API Error ${response.status}:`, errorData);
            // Use a more generic message for the user
            throw new Error(errorData.message ? `Server error: ${errorData.message}` : `An unexpected server error occurred (HTTP ${response.status}).`);
        }
        if (response.status === 204) return null;
        return response.json();
    } catch (error) {
        console.error('Authenticated fetch error:', error.message);
        // Display a simplified error message
        caseloadMessage.textContent = 'An error occurred. Please try again later.';
        caseloadMessage.className = 'error-message';
        throw error; 
    }
}

// --- Auth Functions ---
async function handleLogin(event) {
    event.preventDefault();
    loginError.textContent = '';
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;

    if (!supabase) {
        loginError.textContent = 'Supabase client not initialized. Please contact support.';
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            loginError.textContent = 'Login failed. Please check your credentials and try again.';
            console.error('Login error:', error.message);
            return;
        }
        if (data && data.session) {
            currentSession = data.session;
            currentUser = data.user;
            showCaseloadView();
            await fetchCustomers();
        } else {
            loginError.textContent = 'Login failed. No session data. Please try again.';
        }
    } catch (err) {
        loginError.textContent = 'An unexpected error occurred during login. Please try again.';
        console.error('Login exception:', err.message);
    }
}

async function handleLogout() {
    if (!supabase) {
        console.error('Supabase client not initialized, cannot logout.');
        showLoginView();
        return;
    }
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error.message);
            caseloadMessage.textContent = 'Error during logout. Please try again.';
            caseloadMessage.className = 'error-message';
        }
    } catch (err) {
        console.error('Logout exception:', err.message);
        caseloadMessage.textContent = 'An unexpected error occurred during logout.';
        caseloadMessage.className = 'error-message';
    } finally {
        currentUser = null;
        currentSession = null;
        customers = [];
        editingCustomerId = null;
        showLoginView();
        clearCustomerForm();
        renderCustomers(); // Clear the list
    }
}

async function checkUserSession() {
    if (!supabase) {
        showLoginView();
        return;
    }
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.error("Error getting session:", error.message);
            showLoginView();
            return;
        }
        if (data && data.session) {
            currentSession = data.session;
            currentUser = data.session.user;
            showCaseloadView();
            await fetchCustomers();
        } else {
            showLoginView();
        }
    } catch (err) {
        console.error("Exception in checkUserSession:", err.message);
        showLoginView();
    }

    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentSession = session;
            currentUser = session.user;
            showCaseloadView();
            fetchCustomers(); // Fetch customers on sign-in
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentSession = null;
            customers = [];
            editingCustomerId = null;
            showLoginView();
            clearCustomerForm();
            renderCustomers();
        } else if (event === 'TOKEN_REFRESHED' && session) {
            currentSession = session; // Update the session
        }
    });
}


// --- UI View Management ---
function showLoginView() {
    loginSection.style.display = 'block';
    caseloadSection.style.display = 'none';
    if (jobSearchSection) jobSearchSection.style.display = 'none'; // Hide job search when logged out
    loginEmailInput.value = '';
    loginPasswordInput.value = '';
    loginError.textContent = '';
}

function showCaseloadView() {
    loginSection.style.display = 'none';
    caseloadSection.style.display = 'block';
    if (jobSearchSection) jobSearchSection.style.display = 'block'; // Show job search when logged in
    caseloadMessage.textContent = '';
    caseloadMessage.className = 'message';
    if (jobSearchMessage) jobSearchMessage.textContent = ''; // Clear job search messages
}

// --- Caseload CRUD Functions ---
async function fetchCustomers() {
    if (!currentUser) return;
    caseloadMessage.textContent = 'Loading customers...';
    caseloadMessage.className = 'message';
    try {
        const data = await authenticatedFetch('/api/customers', { method: 'GET' });
        customers = data || [];
        renderCustomers();
        caseloadMessage.textContent = '';
    } catch (error) {
        console.error('Fetch customers error:', error);
        caseloadMessage.textContent = 'Failed to load customer data. Please refresh the page or try again later.';
        caseloadMessage.className = 'error-message';
        customers = []; 
        renderCustomers(); 
    }
}

function renderCustomers() {
    customerListUl.innerHTML = ''; // Clear existing list

    if (customers.length === 0) {
        noCustomersMessage.style.display = 'block';
        return;
    }
    noCustomersMessage.style.display = 'none';

    customers.forEach(customer => {
        const li = document.createElement('li');
        li.setAttribute('data-id', customer.id);

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'customer-details';
        detailsDiv.innerHTML = `
            <strong>${customer.name}</strong><br>
            <small>Email: ${customer.email || 'N/A'}</small><br>
            <small>Phone: ${customer.phone || 'N/A'}</small>
            ${customer.notes ? `<br><small>Notes: ${customer.notes.substring(0, 50)}${customer.notes.length > 50 ? '...' : ''}</small>` : ''}
        `;
        li.appendChild(detailsDiv);

        // CV Upload Area
        const cvAreaDiv = document.createElement('div');
        cvAreaDiv.className = 'customer-cv-area';
        cvAreaDiv.innerHTML = `
            <label for="cv-upload-${customer.id}">CV:</label>
            <input type="file" id="cv-upload-${customer.id}" name="cvFile" accept=".pdf,.doc,.docx,.txt" style="display: none;">
            <button type="button" class="select-cv-button" data-customer-id="${customer.id}">Choose File</button>
            <button type="button" class="upload-cv-button" data-customer-id="${customer.id}" style="display: none;">Upload CV</button>
            <span class="cv-filename" id="cv-filename-${customer.id}">
                ${customer.cv_original_filename ? customer.cv_original_filename : 'No CV uploaded'}
            </span>
            ${customer.cv_parsed_text ? `<button type="button" class="view-cv-button" data-customer-id="${customer.id}">View Parsed CV</button>` : ''}
        `;
        li.appendChild(cvAreaDiv);
        
        // Event listener for "Choose File" button to trigger file input
        cvAreaDiv.querySelector('.select-cv-button').addEventListener('click', (e) => {
            document.getElementById(`cv-upload-${e.target.dataset.customerId}`).click();
        });

        // Event listener for file input change
        const fileInput = cvAreaDiv.querySelector(`#cv-upload-${customer.id}`);
        fileInput.addEventListener('change', (e) => {
            const uploadButton = cvAreaDiv.querySelector('.upload-cv-button');
            const filenameSpan = cvAreaDiv.querySelector(`#cv-filename-${customer.id}`);
            if (e.target.files.length > 0) {
                filenameSpan.textContent = e.target.files[0].name;
                uploadButton.style.display = 'inline-block'; // Show upload button
            } else {
                filenameSpan.textContent = customer.cv_original_filename || 'No CV uploaded';
                uploadButton.style.display = 'none'; // Hide upload button
            }
        });
        
        // Event listener for "Upload CV" button
        cvAreaDiv.querySelector('.upload-cv-button').addEventListener('click', (e) => {
             const selectedFile = fileInput.files[0];
             if(selectedFile) {
                handleUploadCV(customer.id, selectedFile);
             } else {
                caseloadMessage.textContent = 'Please select a CV file first.';
                caseloadMessage.className = 'error-message';
             }
        });

        // Event listener for "View Parsed CV" button
        const viewCvButton = cvAreaDiv.querySelector('.view-cv-button');
        if (viewCvButton) {
            viewCvButton.addEventListener('click', () => showCvTextModal(customer.cv_parsed_text));
        }

        // CV Tailoring Area (dynamically added)
        const cvTailoringAreaDiv = document.createElement('div');
        cvTailoringAreaDiv.className = 'customer-cv-tailoring-area';
        cvTailoringAreaDiv.id = `cv-tailoring-area-${customer.id}`;
        cvTailoringAreaDiv.innerHTML = `
            <h5>Tailor CV for a Job</h5>
            <textarea id="job-description-input-${customer.id}" placeholder="Paste full job description here..." rows="8"></textarea>
            <input type="text" id="job-title-input-${customer.id}" placeholder="Job Title (Optional)">
            <input type="text" id="job-company-input-${customer.id}" placeholder="Company Name (Optional)">
            <button type="button" class="generate-tailored-cv-button" data-customer-id="${customer.id}">Generate Tailored CV</button>
            <p class="tailoring-status-message" id="tailoring-status-message-${customer.id}" aria-live="polite"></p> 
        `;
        // Add aria-live to dynamically created status message
        const statusP = cvTailoringAreaDiv.querySelector(`#tailoring-status-message-${customer.id}`);
        if (statusP) statusP.setAttribute('aria-live', 'polite');
        
        li.appendChild(cvTailoringAreaDiv);

        // Event listener for "Generate Tailored CV" button
        cvTailoringAreaDiv.querySelector('.generate-tailored-cv-button').addEventListener('click', (e) => {
            const currentCustomerId = e.target.dataset.customerId;
            handleGenerateTailoredCV(currentCustomerId);
        });


        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'customer-actions';

        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.className = 'edit-customer-button';
        editButton.addEventListener('click', () => handleEditCustomer(customer.id));

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete-customer-button';
        deleteButton.style.backgroundColor = '#dc3545'; // Danger color
        deleteButton.addEventListener('click', () => handleDeleteCustomer(customer.id));

        actionsDiv.appendChild(editButton);
        actionsDiv.appendChild(deleteButton);

        li.appendChild(actionsDiv);
        customerListUl.appendChild(li);
    });
}

async function handleUploadCV(customerId, file) {
    if (!file) {
        caseloadMessage.textContent = 'No file selected for upload.';
        caseloadMessage.className = 'error-message';
        return;
    }

    const formData = new FormData();
    formData.append('cv', file);

    caseloadMessage.textContent = `Uploading CV for customer ${customerId}...`;
    caseloadMessage.className = 'message';

    try {
        // Note: For FormData, 'Content-Type' is set by the browser. Do not set it manually in authenticatedFetch.
        const result = await authenticatedFetch(`/api/customers/${customerId}/cv`, {
            method: 'POST',
            body: formData, 
        });

        caseloadMessage.textContent = result.message || 'CV uploaded successfully!';
        caseloadMessage.className = 'message';
        
        // Update customer in local list or refetch
        const customerIndex = customers.findIndex(c => c.id === customerId);
        if (customerIndex !== -1 && result.customer) {
            customers[customerIndex] = { ...customers[customerIndex], ...result.customer };
        }
        renderCustomers(); // Re-render to show new CV info and hide upload button if successful
        
        // If a specific file input was used, reset it (optional, as it's per list item now)
        const fileInput = document.getElementById(`cv-upload-${customerId}`);
        if (fileInput) {
            fileInput.value = ''; // Clear the file input
            const uploadButton = fileInput.parentElement.querySelector('.upload-cv-button');
             if(uploadButton) uploadButton.style.display = 'none';
        }


    } catch (error) {
        console.error('CV Upload error:', error);
        caseloadMessage.textContent = 'Failed to upload CV. Please try again.';
        caseloadMessage.className = 'error-message';
    }
}

let previouslyFocusedElement = null;

function openModal(modalElement) {
    if (!modalElement) return;
    previouslyFocusedElement = document.activeElement;
    modalElement.style.display = 'block';
    const focusableElements = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusableElements.length > 0) {
        focusableElements[0].focus();
    }
}

function closeModal(modalElement) {
    if (!modalElement) return;
    modalElement.style.display = 'none';
    if (previouslyFocusedElement) {
        previouslyFocusedElement.focus();
        previouslyFocusedElement = null;
    }
}

function showCvTextModal(text) {
    if (cvTextModal && cvParsedTextContent) {
        cvParsedTextContent.textContent = text || 'No parsed text available.';
        openModal(cvTextModal);
    }
}

function closeCvTextModal() {
    closeModal(cvTextModal);
}

// --- CV Tailoring Functions ---
async function handleGenerateTailoredCV(customerId) {
    if (!customerId) {
        alert('Error: Customer ID is missing.');
        return;
    }
    
    const customer = customers.find(c => c.id === customerId);
    const statusMessage = document.getElementById(`tailoring-status-message-${customerId}`);

    if (!customer || !customer.cv_parsed_text) {
        if (statusMessage) {
            statusMessage.textContent = 'Original CV text not found. Please upload and parse a CV first.';
            statusMessage.className = 'tailoring-status-message error-message';
        } else {
            alert('Original CV text not found. Please upload and parse a CV first.');
        }
        return;
    }

    const jobDescriptionInput = document.getElementById(`job-description-input-${customerId}`);
    const jobTitleInput = document.getElementById(`job-title-input-${customerId}`);
    const jobCompanyInput = document.getElementById(`job-company-input-${customerId}`);
    
    const jobDescription = jobDescriptionInput ? jobDescriptionInput.value.trim() : '';
    const jobTitle = jobTitleInput ? jobTitleInput.value.trim() : '';
    const jobCompany = jobCompanyInput ? jobCompanyInput.value.trim() : '';

    if (!jobDescription) {
        if (statusMessage) {
            statusMessage.textContent = 'Job Description is required.';
            statusMessage.className = 'tailoring-status-message error-message';
        }
        return;
    }

    if (statusMessage) {
        statusMessage.textContent = 'Generating tailored CV...';
        statusMessage.className = 'tailoring-status-message message';
    }

    try {
        const response = await authenticatedFetch(`/api/customers/${customerId}/tailor-cv`, {
            method: 'POST',
            body: JSON.stringify({ jobDescription, jobTitle, jobCompany }),
        });

        if (response && response.tailoredCvText) {
            currentTailoredCvText = response.tailoredCvText;
            tailoredCvOutput.textContent = currentTailoredCvText;
            openModal(tailoredCvModal);
            if (statusMessage) {
                statusMessage.textContent = 'Tailored CV generated successfully.';
                statusMessage.className = 'tailoring-status-message message';
            }
        } else {
            throw new Error('No tailored CV text received.');
        }

    } catch (error) {
        console.error('Tailor CV error:', error.message);
        if (statusMessage) {
            statusMessage.textContent = 'Failed to tailor CV. Please try again.';
            statusMessage.className = 'tailoring-status-message error-message';
        }
    }
}

function closeTailoredCvModal() {
    closeModal(tailoredCvModal);
    currentTailoredCvText = ''; 
}

function copyTailoredCv() {
    if (!currentTailoredCvText) {
        alert('No tailored CV text to copy.');
        return;
    }
    navigator.clipboard.writeText(currentTailoredCvText)
        .then(() => {
            alert('Tailored CV copied to clipboard!');
        })
        .catch(err => {
            console.error('Failed to copy tailored CV: ', err);
            alert('Failed to copy text. Please try manually.');
        });
}

function downloadTailoredCvAsMarkdown() {
    if (!currentTailoredCvText) {
        alert('No tailored CV text to download.');
        return;
    }
    const blob = new Blob([currentTailoredCvText], { type: 'text/markdown;charset=utf-8' });
    const customer = customers.find(c => c.id === editingCustomerId); // Assuming editingCustomerId is the relevant one
    const filename = customer ? `tailored_cv_${customer.name.replace(/\s+/g, '_') || 'customer'}.md` : 'tailored_cv.md';
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}


async function handleSaveCustomer(event) {
    event.preventDefault();
    if (!currentUser) return;

    const customerData = {
        name: customerNameInput.value,
        email: customerEmailInput.value,
        phone: customerPhoneInput.value,
        notes: customerNotesInput.value,
    };

    // Basic client-side validation
    if (!customerData.name) {
        caseloadMessage.textContent = 'Customer name is required.';
        caseloadMessage.className = 'error-message';
        return;
    }

    caseloadMessage.textContent = 'Saving customer...';
    caseloadMessage.className = 'message';

    try {
        let result;
        if (editingCustomerId) {
            // Update existing customer
            result = await authenticatedFetch(`/api/customers/${editingCustomerId}`, {
                method: 'PUT',
                body: JSON.stringify(customerData),
            });
            caseloadMessage.textContent = 'Customer updated successfully!';
        } else {
            // Add new customer
            result = await authenticatedFetch('/api/customers', {
                method: 'POST',
                body: JSON.stringify(customerData),
            });
            caseloadMessage.textContent = 'Customer added successfully!';
        }
        caseloadMessage.className = 'message';
        clearCustomerForm();
        await fetchCustomers(); // Refresh the list
    } catch (error) {
        console.error('Save customer error:', error);
        caseloadMessage.textContent = 'Failed to save customer details. Please try again.';
        caseloadMessage.className = 'error-message';
    }
}

function handleEditCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
        editingCustomerId = customer.id;
        customerIdInput.value = customer.id;
        customerNameInput.value = customer.name;
        customerEmailInput.value = customer.email || '';
        customerPhoneInput.value = customer.phone || '';
        customerNotesInput.value = customer.notes || '';
        saveCustomerButton.textContent = 'Update Customer';
        customerFormArea.scrollIntoView({ behavior: 'smooth' }); // Scroll to form
        customerNameInput.focus();
        caseloadMessage.textContent = `Editing customer: ${customer.name}`;
        caseloadMessage.className = 'message';
    }
}

async function handleDeleteCustomer(customerId) {
    if (!confirm('Are you sure you want to delete this customer?')) {
        return;
    }
    caseloadMessage.textContent = 'Deleting customer...';
    caseloadMessage.className = 'message';
    try {
        await authenticatedFetch(`/api/customers/${customerId}`, { method: 'DELETE' });
        caseloadMessage.textContent = 'Customer deleted successfully!';
        caseloadMessage.className = 'message';
        if (editingCustomerId === customerId) { // If deleting the customer currently being edited
            clearCustomerForm();
        }
        await fetchCustomers(); // Refresh list
    } catch (error) {
        console.error('Delete customer error:', error);
        caseloadMessage.textContent = 'Failed to delete customer. Please try again.';
        caseloadMessage.className = 'error-message';
    }
}

function clearCustomerForm() {
    customerForm.reset(); 
    customerIdInput.value = '';
    editingCustomerId = null;
    saveCustomerButton.textContent = 'Save Customer';
    if (clearFormButton) clearFormButton.textContent = 'Clear Form'; // Reset button text
    caseloadMessage.textContent = ''; 
}


// --- Job Search Functions ---
async function handleJobSearch(event) {
    event.preventDefault();
    if (!currentUser) return;

    const keywords = jobSearchKeywordsInput.value.trim();
    const location = jobSearchLocationInput.value.trim();
    const radius = parseInt(jobSearchRadiusInput.value, 10);

    if (!keywords || !location) {
        jobSearchMessage.textContent = 'Keywords and Location are required.';
        jobSearchMessage.className = 'error-message';
        return;
    }
    if (isNaN(radius) || radius <= 0) {
        jobSearchMessage.textContent = 'Please enter a valid radius (e.g., 5, 10).';
        jobSearchMessage.className = 'error-message';
        return;
    }

    jobSearchMessage.textContent = 'Searching for jobs...';
    jobSearchMessage.className = 'message';
    jobSearchResultsDiv.innerHTML = ''; 

    try {
        const results = await authenticatedFetch('/api/job-search', {
            method: 'POST',
            body: JSON.stringify({ keywords, location, radius }),
        });

        if (results) {
            jobSearchMessage.textContent = 'Search complete.';
            jobSearchMessage.className = 'message';

            const dwpHeader = document.createElement('h3');
            dwpHeader.textContent = 'Jobs from Find a Job (DWP)';
            jobSearchResultsDiv.appendChild(dwpHeader);

            if (results.dwpJobs && results.dwpJobs.length > 0) {
                const dwpList = document.createElement('ul');
                dwpList.className = 'dwp-job-list';
                results.dwpJobs.forEach(job => {
                    const li = document.createElement('li');
                    li.className = 'dwp-job-item';
                    let titleHtml = `<strong>${job.title || 'N/A'}</strong>`;
                    if (job.url) {
                        titleHtml = `<a href="${job.url}" target="_blank">${job.title || 'N/A'}</a>`;
                    }
                    li.innerHTML = `
                        <div class="job-title">${titleHtml}</div>
                        <div class="job-company">Company: ${job.companyName || 'N/A'}</div>
                        <div class="job-location">Location: ${job.location || 'N/A'}</div>
                        <div class="job-description">${job.description ? (job.description.substring(0,150) + '...') : 'No description.'}</div>
                        ${job.postedDate ? `<div class="job-date">Posted: ${new Date(job.postedDate).toLocaleDateString()}</div>` : ''}
                        ${job.salary ? `<div class="job-salary">Salary: ${job.salary}</div>` : ''}
                    `;
                    dwpList.appendChild(li);
                });
                jobSearchResultsDiv.appendChild(dwpList);
            } else {
                 const noDwpJobs = document.createElement('p');
                 noDwpJobs.textContent = 'No DWP jobs found (Note: DWP integration is a placeholder).';
                 jobSearchResultsDiv.appendChild(noDwpJobs);
            }

            if (results.searchLinks && results.searchLinks.length > 0) {
                const linksHeader = document.createElement('h4');
                linksHeader.textContent = 'Search on Other Platforms';
                jobSearchResultsDiv.appendChild(linksHeader);
                const linksList = document.createElement('ul');
                results.searchLinks.forEach(linkInfo => {
                    const li = document.createElement('li');
                    li.className = 'search-link-item';
                    const a = document.createElement('a');
                    a.href = linkInfo.url;
                    a.target = '_blank';
                    a.textContent = `Search on ${linkInfo.platform}`;
                    li.appendChild(a);
                    linksList.appendChild(li);
                });
                jobSearchResultsDiv.appendChild(linksList);
            }
        } else {
            jobSearchMessage.textContent = 'No results or an error occurred during search.';
            jobSearchMessage.className = 'message';
        }

    } catch (error) {
        console.error('Job search error:', error.message);
        jobSearchMessage.textContent = 'Failed to perform job search. Please try again.';
        jobSearchMessage.className = 'error-message';
    }
}


// --- Event Listeners ---
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
} else {
    console.error('Login form not found.');
}

if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
} else {
    console.error('Logout button not found.');
}

if (customerForm) {
    customerForm.addEventListener('submit', handleSaveCustomer);
} else {
    console.error('Customer form not found.');
}

if (clearFormButton) {
    clearFormButton.addEventListener('click', clearCustomerForm);
} else {
    console.error('Clear form button not found.');
}

if (cvModalCloseButton) { // For original CV modal
    cvModalCloseButton.addEventListener('click', closeCvTextModal);
}
// Close original CV modal if user clicks outside the modal content
window.addEventListener('click', (event) => {
    if (event.target === cvTextModal) {
        closeCvTextModal();
    }
});


if (closeTailoredCvModalButton) {
    closeTailoredCvModalButton.addEventListener('click', closeTailoredCvModal);
}
if (copyTailoredCvButton) {
    copyTailoredCvButton.addEventListener('click', copyTailoredCv);
}
if (downloadMdButton) {
    downloadMdButton.addEventListener('click', downloadTailoredCvAsMarkdown);
}
// Close tailored CV modal if user clicks outside the modal content
window.addEventListener('click', (event) => {
    if (event.target === tailoredCvModal) {
        closeTailoredCvModal();
    }
});


if (jobSearchForm) {
    jobSearchForm.addEventListener('submit', handleJobSearch);
} else {
    console.error('Job search form not found.');
}

// Modal focus trap and escape key handling
function setupModalAccessibility(modalElement, closeFunction) {
    if (!modalElement) return;

    const focusableElementsSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    let focusableElements = Array.from(modalElement.querySelectorAll(focusableElementsSelector));
    let firstFocusableElement = focusableElements[0];
    let lastFocusableElement = focusableElements[focusableElements.length - 1];

    // Re-query focusable elements if modal content changes dynamically
    const observer = new MutationObserver(() => {
        focusableElements = Array.from(modalElement.querySelectorAll(focusableElementsSelector));
        firstFocusableElement = focusableElements[0];
        lastFocusableElement = focusableElements[focusableElements.length - 1];
    });
    observer.observe(modalElement, { childList: true, subtree: true });


    modalElement.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFunction();
            return;
        }
        if (e.key === 'Tab') {
            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstFocusableElement) {
                    lastFocusableElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastFocusableElement) {
                    firstFocusableElement.focus();
                    e.preventDefault();
                }
            }
        }
    });
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    if (!supabase) {
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Critical Error: Application services could not load. Please contact support.</p>';
        }
        console.error("Supabase client not available. App will not function.");
        return;
    }

    if (clearFormButton) { // Set initial text for the clear button
        clearFormButton.textContent = 'Clear Form';
    }
    
    checkUserSession();
    setupModalAccessibility(cvTextModal, closeCvTextModal);
    setupModalAccessibility(tailoredCvModal, closeTailoredCvModal);
});
