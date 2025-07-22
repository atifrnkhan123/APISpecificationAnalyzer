// script.js
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const dropZone = document.getElementById('dropZone');
    const apiUrl = document.getElementById('apiUrl');
    const fetchBtn = document.getElementById('fetchBtn');
    const errorMessage = document.getElementById('errorMessage');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const summarySection = document.getElementById('summarySection');
    const controllerSection = document.getElementById('controllerSection');
    const tableSection = document.getElementById('tableSection');
    const exportBtn = document.getElementById('exportBtn');
    const searchInput = document.getElementById('searchInput');
    const toggleControllerBtn = document.getElementById('toggleControllerBtn');
    const apiTableBody = document.getElementById('apiTableBody');
    const controllerCards = document.getElementById('controllerCards');
    const totalControllers = document.getElementById('totalControllers');
    const totalAPIs = document.getElementById('totalAPIs');
    const methodCounts = document.getElementById('methodCounts');
    const largestController = document.getElementById('largestController');
    
    let apiData = [];
    let filteredData = [];
    let controllerStats = {};
    
    // Initialize
    initEventListeners();
    
    function initEventListeners() {
        // File input events
        browseBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
        
        // Drag and drop events
        setupDragAndDrop();
        
        // URL fetch event
        fetchBtn.addEventListener('click', handleUrlFetch);
        apiUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUrlFetch();
        });
        
        // Export and search events
        exportBtn.addEventListener('click', exportToCSV);
        searchInput.addEventListener('input', filterTable);
        
        // Controller stats toggle
        toggleControllerBtn.addEventListener('click', () => {
            controllerSection.style.display = controllerSection.style.display === 'none' ? 'block' : 'none';
            toggleControllerBtn.innerHTML = controllerSection.style.display === 'none' ? 
                '<i class="fas fa-chart-pie"></i> Show Controller Stats' : 
                '<i class="fas fa-times"></i> Hide Controller Stats';
        });
    }
    
    function setupDragAndDrop() {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--primary)';
            dropZone.style.background = '#f0f8ff';
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = '';
            dropZone.style.background = '';
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '';
            dropZone.style.background = '';
            
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                handleFileSelect();
            }
        });
    }
    
    function handleUrlFetch() {
        const url = apiUrl.value.trim();
        if (!url) {
            showError('Please enter a valid URL');
            return;
        }
        
        if (!isValidUrl(url)) {
            showError('Please enter a valid URL starting with http:// or https://');
            return;
        }
        
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        
        // Use a proxy to avoid CORS issues
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        
        fetch(proxyUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
            })
            .then(content => {
                try {
                    let spec;
                    
                    // Try to parse as JSON
                    try {
                        spec = JSON.parse(content);
                    } catch (e) {
                        // If JSON fails, try to parse as YAML
                        spec = jsyaml.load(content);
                    }
                    
                    processSpecification(spec);
                } catch (error) {
                    showError('Error parsing API specification: ' + error.message);
                    loadingIndicator.style.display = 'none';
                }
            })
            .catch(error => {
                showError('Failed to fetch API specification: ' + error.message);
                loadingIndicator.style.display = 'none';
            });
    }
    
    function handleFileSelect() {
        const file = fileInput.files[0];
        if (!file) return;
        
        const validTypes = ['application/json', 'text/yaml', 'text/x-yaml', 'application/x-yaml'];
        const fileExt = file.name.split('.').pop().toLowerCase();
        
        if (!(validTypes.includes(file.type) || ['json', 'yaml', 'yml'].includes(fileExt))) {
            showError('Invalid file type. Please upload a JSON or YAML file.');
            return;
        }
        
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                let spec;
                
                if (file.name.endsWith('.json')) {
                    spec = JSON.parse(content);
                } else {
                    spec = jsyaml.load(content);
                }
                
                processSpecification(spec);
            } catch (error) {
                showError('Error parsing file: ' + error.message);
                loadingIndicator.style.display = 'none';
            }
        };
        
        reader.onerror = function() {
            showError('Error reading file');
            loadingIndicator.style.display = 'none';
        };
        
        reader.readAsText(file);
    }
    
    function processSpecification(spec) {
        try {
            // Check if it's Swagger or OpenAPI
            if (spec.swagger && spec.swagger.startsWith('2.')) {
                apiData = parseSwagger2(spec);
            } else if (spec.openapi && spec.openapi.startsWith('3.')) {
                apiData = parseOpenAPI3(spec);
            } else {
                showError('Unsupported specification version. Only Swagger 2.0 and OpenAPI 3.0 are supported.');
                return;
            }
            
            filteredData = [...apiData];
            calculateControllerStats();
            displayCompactSummary();
            displayControllerCards();
            displayTable(apiData);
            
            summarySection.style.display = 'block';
            controllerSection.style.display = 'block';
            tableSection.style.display = 'block';
            
            // Scroll to results
            setTimeout(() => {
                summarySection.scrollIntoView({ behavior: 'smooth' });
            }, 300);
            
        } catch (error) {
            showError('Error processing specification: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }
    
    function parseSwagger2(spec) {
        const operations = [];
        let serial = 1;
        
        for (const [path, methods] of Object.entries(spec.paths)) {
            for (const [method, operation] of Object.entries(methods)) {
                if (!['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) continue;
                
                // Combine parameters
                const pathParams = spec.paths[path].parameters || [];
                const opParams = operation.parameters || [];
                const combinedParams = [...pathParams, ...opParams];
                
                // Extract parameters
                const headers = combinedParams.filter(p => p.in === 'header');
                const pathParamsList = combinedParams.filter(p => p.in === 'path');
                const queryParams = combinedParams.filter(p => p.in === 'query');
                const bodyParam = combinedParams.find(p => p.in === 'body');
                
                // Extract required fields
                const requiredFields = [];
                
                // Headers
                const headerList = headers.map(h => {
                    if (h.required) requiredFields.push(h.name);
                    return h.required ? `${h.name}*` : h.name;
                });
                
                // Path parameters
                const pathParamList = pathParamsList.map(p => {
                    if (p.required) requiredFields.push(p.name);
                    return p.required ? `${p.name}*` : p.name;
                });
                
                // Query parameters
                const queryParamList = queryParams.map(q => {
                    if (q.required) requiredFields.push(q.name);
                    return q.required ? `${q.name}*` : q.name;
                });
                
                // Request body
                let requestBody = '';
                if (bodyParam && bodyParam.schema) {
                    const bodyFields = [];
                    const requiredBodyFields = bodyParam.schema.required || [];
                    
                    if (bodyParam.schema.properties) {
                        for (const [field, props] of Object.entries(bodyParam.schema.properties)) {
                            const isRequired = requiredBodyFields.includes(field);
                            if (isRequired) requiredFields.push(field);
                            bodyFields.push(isRequired ? `${field}*` : field);
                        }
                    }
                    
                    requestBody = bodyFields.join(', ');
                }
                
                operations.push({
                    serial: serial++,
                    controller: operation.tags ? operation.tags[0] : 'N/A',
                    endpoint: path,
                    method: method.toUpperCase(),
                    headers: headerList.join(', '),
                    pathParams: pathParamList.join(', '),
                    queryParams: queryParamList.join(', '),
                    requiredFields: requiredFields.join(', '),
                    requestBody: requestBody
                });
            }
        }
        
        return operations;
    }
    
    function parseOpenAPI3(spec) {
        const operations = [];
        let serial = 1;
        
        for (const [path, pathItem] of Object.entries(spec.paths)) {
            for (const [method, operation] of Object.entries(pathItem)) {
                if (!['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) continue;
                
                // Combine parameters
                const pathParams = pathItem.parameters || [];
                const opParams = operation.parameters || [];
                const combinedParams = [...pathParams, ...opParams];
                
                // Extract parameters
                const headers = combinedParams.filter(p => p.in === 'header');
                const pathParamsList = combinedParams.filter(p => p.in === 'path');
                const queryParams = combinedParams.filter(p => p.in === 'query');
                
                // Extract required fields
                const requiredFields = [];
                
                // Headers
                const headerList = headers.map(h => {
                    if (h.required) requiredFields.push(h.name);
                    return h.required ? `${h.name}*` : h.name;
                });
                
                // Path parameters
                const pathParamList = pathParamsList.map(p => {
                    if (p.required) requiredFields.push(p.name);
                    return p.required ? `${p.name}*` : p.name;
                });
                
                // Query parameters
                const queryParamList = queryParams.map(q => {
                    if (q.required) requiredFields.push(q.name);
                    return q.required ? `${q.name}*` : q.name;
                });
                
                // Request body
                let requestBody = '';
                if (operation.requestBody) {
                    const content = operation.requestBody.content;
                    const mediaType = content['application/json'] || Object.values(content)[0];
                    
                    if (mediaType && mediaType.schema) {
                        const bodyFields = [];
                        const requiredBodyFields = mediaType.schema.required || [];
                        
                        if (mediaType.schema.properties) {
                            for (const [field, props] of Object.entries(mediaType.schema.properties)) {
                                const isRequired = requiredBodyFields.includes(field);
                                if (isRequired) requiredFields.push(field);
                                bodyFields.push(isRequired ? `${field}*` : field);
                            }
                        }
                        
                        requestBody = bodyFields.join(', ');
                    }
                }
                
                operations.push({
                    serial: serial++,
                    controller: operation.tags ? operation.tags[0] : 'N/A',
                    endpoint: path,
                    method: method.toUpperCase(),
                    headers: headerList.join(', '),
                    pathParams: pathParamList.join(', '),
                    queryParams: queryParamList.join(', '),
                    requiredFields: requiredFields.join(', '),
                    requestBody: requestBody
                });
            }
        }
        
        return operations;
    }
    
    function calculateControllerStats() {
        controllerStats = {};
        
        // Count APIs per controller
        apiData.forEach(op => {
            const controller = op.controller;
            if (!controllerStats[controller]) {
                controllerStats[controller] = {
                    count: 0,
                    methods: {}
                };
            }
            
            controllerStats[controller].count++;
            
            // Count methods per controller
            if (!controllerStats[controller].methods[op.method]) {
                controllerStats[controller].methods[op.method] = 0;
            }
            controllerStats[controller].methods[op.method]++;
        });
    }
    
    function displayCompactSummary() {
        // Update basic counts
        totalAPIs.textContent = apiData.length;
        
        // Count controllers
        const controllers = Object.keys(controllerStats);
        totalControllers.textContent = controllers.length;
        
        // Find the controller with the most APIs
        let maxController = '';
        let maxCount = 0;
        
        controllers.forEach(controller => {
            if (controllerStats[controller].count > maxCount) {
                maxCount = controllerStats[controller].count;
                maxController = controller;
            }
        });
        
        if (maxController) {
            largestController.textContent = `${maxController} (${maxCount})`;
        } else {
            largestController.textContent = '-';
        }
        
        // Count by method
        const methodCount = {};
        apiData.forEach(op => {
            methodCount[op.method] = (methodCount[op.method] || 0) + 1;
        });
        
        // Display method counts
        methodCounts.innerHTML = '';
        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
        
        methods.forEach(method => {
            if (methodCount[method]) {
                const count = methodCount[method];
                const methodItem = document.createElement('div');
                methodItem.className = 'method-item';
                methodItem.innerHTML = `
                    <div class="method-name ${method.toLowerCase()}">${method}</div>
                    <div class="summary-value">${count}</div>
                `;
                methodCounts.appendChild(methodItem);
            }
        });
    }
    
    function displayControllerCards() {
        controllerCards.innerHTML = '';
        
        // Sort controllers by API count (descending)
        const sortedControllers = Object.keys(controllerStats).sort((a, b) => {
            return controllerStats[b].count - controllerStats[a].count;
        });
        
        // Create cards for each controller
        sortedControllers.forEach(controller => {
            const card = document.createElement('div');
            card.className = 'controller-card';
            
            const stats = controllerStats[controller];
            const methodDetails = Object.entries(stats.methods)
                .map(([method, count]) => `<span class="method-name ${method.toLowerCase()}">${method}: ${count}</span>`)
                .join(' ');
            
            card.innerHTML = `
                <div class="controller-name">
                    <i class="fas fa-folder"></i> ${controller}
                </div>
                <div class="controller-count">${stats.count} APIs</div>
                <div class="method-details">${methodDetails}</div>
            `;
            
            controllerCards.appendChild(card);
        });
    }
    
    function displayTable(operations) {
        apiTableBody.innerHTML = '';
        
        operations.forEach(op => {
            const row = document.createElement('tr');
            
            // Apply method-specific styling
            let methodClass = '';
            switch(op.method) {
                case 'GET': methodClass = 'get-method'; break;
                case 'POST': methodClass = 'post-method'; break;
                case 'PUT': methodClass = 'put-method'; break;
                case 'DELETE': methodClass = 'delete-method'; break;
                case 'PATCH': methodClass = 'patch-method'; break;
            }
            
            row.innerHTML = `
                <td>${op.serial}</td>
                <td>${op.controller}</td>
                <td>${op.endpoint}</td>
                <td class="method-cell ${methodClass}">${op.method}</td>
                <td class="param-cell">${op.headers || '-'}</td>
                <td class="param-cell">${op.pathParams || '-'}</td>
                <td class="param-cell">${op.queryParams || '-'}</td>
                <td class="param-cell">${op.requiredFields || '-'}</td>
                <td class="param-cell">${op.requestBody || '-'}</td>
            `;
            
            apiTableBody.appendChild(row);
        });
    }
    
    function filterTable() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        
        if (!searchTerm) {
            filteredData = [...apiData];
            displayTable(filteredData);
            return;
        }
        
        filteredData = apiData.filter(op => {
            return (
                op.controller.toLowerCase().includes(searchTerm) ||
                op.endpoint.toLowerCase().includes(searchTerm) ||
                op.method.toLowerCase().includes(searchTerm) ||
                (op.headers && op.headers.toLowerCase().includes(searchTerm)) ||
                (op.pathParams && op.pathParams.toLowerCase().includes(searchTerm)) ||
                (op.queryParams && op.queryParams.toLowerCase().includes(searchTerm)) ||
                (op.requiredFields && op.requiredFields.toLowerCase().includes(searchTerm)) ||
                (op.requestBody && op.requestBody.toLowerCase().includes(searchTerm))
            );
        });
        
        displayTable(filteredData);
    }
    
    function exportToCSV() {
        if (filteredData.length === 0) return;
        
        let csvContent = 'S.No,Controller,Endpoint,Method,Headers,Path Params,Query Params,Required Fields,Request Body\n';
        
        filteredData.forEach(op => {
            const row = [
                op.serial,
                `"${op.controller.replace(/"/g, '""')}"`,
                `"${op.endpoint.replace(/"/g, '""')}"`,
                op.method,
                `"${(op.headers || '-').replace(/"/g, '""')}"`,
                `"${(op.pathParams || '-').replace(/"/g, '""')}"`,
                `"${(op.queryParams || '-').replace(/"/g, '""')}"`,
                `"${(op.requiredFields || '-').replace(/"/g, '""')}"`,
                `"${(op.requestBody || '-').replace(/"/g, '""')}"`
            ].join(',');
            
            csvContent += row + '\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'api_details.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Auto hide error after 5 seconds
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }
    
    function isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    // Auto-fetch the example API on page load
    setTimeout(() => {
        if (apiUrl.value) {
            handleUrlFetch();
        }
    }, 500);
});