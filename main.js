let fieldCount = 0;

document.addEventListener('DOMContentLoaded', function() {
    
    console.log("DOM fully loaded and parsed");

    const promptToggle = this.getElementById('prompt-toggle');
    const panelToggle = document.getElementById('panel-toggle');
    const sidePanel = document.getElementById('side-panel');
    const mainContent = document.querySelector('main');
    const schemaList = document.getElementById('schema-list');
    const addFieldButton = document.getElementById('addField');
    const retriesToggle = document.getElementById('retriesToggle');
    const validationForm = document.getElementById('validationForm');

    if (!promptToggle) console.error("prompt-toggle element not found");
    if (!panelToggle) console.error("panel-toggle element not found");
    if (!sidePanel) console.error("side-panel element not found");
    if (!mainContent) console.error("main element not found");
    if (!schemaList) console.error("schema-list element not found");
    if (!addFieldButton) console.error("addField button not found");
    if (!retriesToggle) console.error("retriesToggle element not found");
    if (!validationForm) console.error("validationForm not found");

    if (panelToggle) {
        panelToggle.addEventListener('click', function() {
            console.log("Panel toggle clicked");
            sidePanel.classList.toggle('open');
            mainContent.classList.toggle('panel-open');
            if (sidePanel.classList.contains('open')) {
                displaySavedSchemas();
            }
        });
    }

    if (addFieldButton) {
        addFieldButton.addEventListener('click', addField);
    }

    if (promptToggle) {
        promptToggle.addEventListener('click', function() { 
            promptInput = document.getElementById('prompt');
            promptInput.classList.toggle('expand');
        });
    }

    if (retriesToggle) {
        retriesToggle.addEventListener('click', handleRetriesToggle);
    }

    if (validationForm) {
        validationForm.addEventListener('submit', handleFormSubmit);
    }

    addSaveSchemaButton();
});


function addField() {
    fieldCount++;
    const fieldHtml = `
        <div id="field${fieldCount}" class="field-group">
            <header>
                <h3>Output ${fieldCount}</h3>
                <button type="button" onclick="removeField(${fieldCount})" class="button remove-button">×</button>
            </header>
            <div class="field-flex">
                <div class="input-wrap">
                    <div class="input-prefix">Key:</div><input type="text" name="key${fieldCount}" placeholder="Key" class="input input-field">
                </div>
                <div class="toggle-group">
                    <button type="button" class="toggle-button active" data-type="str" onclick="toggleType(this, ${fieldCount})">Str</button>
                    <button type="button" class="toggle-button" data-type="num" onclick="toggleType(this, ${fieldCount})">Num</button>
                    <button type="button" class="toggle-button" data-type="bool" onclick="toggleType(this, ${fieldCount})">Bool</button>
                    <button type="button" class="toggle-button" data-type="arr" onclick="toggleType(this, ${fieldCount})">Arr</button>
                    <button type="button" class="toggle-button" data-type="obj" onclick="toggleType(this, ${fieldCount})">Obj</button>
                </div>
            </div>
            <input type="hidden" name="type${fieldCount}" value="str">
            <div class="field-flex">
                <div class="input-wrap">
                    <div class="input-prefix">Value:</div><input type="text" name="description${fieldCount}" placeholder="Description" class="input">
                </div>
            </div>
            <div class="llm-validation">
                <input type="checkbox" id="llmValidation${fieldCount}" name="llmValidation${fieldCount}">
                <label for="llmValidation${fieldCount}">Validate with LLM</label>
            </div>
        </div>
    `;
    document.getElementById('structureFields').insertAdjacentHTML('beforeend', fieldHtml);
}

function removeField(fieldId) {
    const fieldElement = document.getElementById(`field${fieldId}`);
    if (fieldElement) {
        fieldElement.remove();
    }
}

function toggleType(button, fieldId) {
    const typeToggle = button.parentElement;
    typeToggle.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    const type = button.dataset.type;
    document.querySelector(`input[name="type${fieldId}"]`).value = type;
}

function addAssertion(fieldId) {
    const assertionId = Date.now();
    const assertionHtml = `
        <div id="assertion${assertionId}" class="assertion-group">
            <select name="assertionType${fieldId}[]" class="input" onchange="toggleAssertionValue(this, ${assertionId})">
                <option value="required">Required</option>
                <option value="llmValidated">LLM Validated</option>
                <option value="custom">Custom</option>
            </select>
            <input type="text" name="assertionValue${fieldId}[]" placeholder="Value" class="input assertion-value">
            <button type="button" onclick="removeAssertion(${assertionId})" class="button remove-button">×</button>
        </div>
    `;
    document.querySelector(`.assertions${fieldId}`).insertAdjacentHTML('beforeend', assertionHtml);
    toggleAssertionValue(document.querySelector(`#assertion${assertionId} select`), assertionId);
}

function toggleArrayType(button, fieldId) {
    const arrayTypeToggle = button.parentElement;
    arrayTypeToggle.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`input[name="arrayType${fieldId}"]`).value = button.dataset.type;
}

function toggleAssertionValue(select, assertionId) {
    const valueInput = select.nextElementSibling;
    if (select.value === 'required') {
        valueInput.style.display = 'none';
        valueInput.value = 'true';
    } else if (select.value === 'llmValidated' || select.value === 'custom') {
        valueInput.style.display = 'inline-block';
        valueInput.placeholder = 'Enter validation criteria';
        valueInput.value = '';
    }
}

function removeAssertion(assertionId) {
    const assertionElement = document.getElementById(`assertion${assertionId}`);
    if (assertionElement) {
        assertionElement.remove();
    }
}

function handleRetriesToggle(e) {
    if (e.target.tagName === 'BUTTON') {
        const retries = e.target.dataset.retries;
        document.getElementById('retries').value = retries;
        document.querySelectorAll('#retriesToggle button').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        prompt: formData.get('prompt'),
        promptModel: formData.get('promptModel'),
        validatorModel: formData.get('validatorModel'),
        retries: parseInt(formData.get('retries'), 10),
        expectedStructure: []
    };

    const fields = document.querySelectorAll('.field-group');
    fields.forEach((field, index) => {
        const fieldId = index + 1;
        const fieldData = {
            key: formData.get(`key${fieldId}`),
            type: formData.get(`type${fieldId}`),
            description: formData.get(`description${fieldId}`),
            llmValidation: formData.get(`llmValidation${fieldId}`) === 'on'
        };

        data.expectedStructure.push(fieldData);
    });

    try {
        const response = await fetch('http://localhost:3000/api/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        displayValidationResults(result);
    } catch (error) {
        document.getElementById('results').innerHTML = `
            <h2 class="title">Error:</h2>
            <p>${error.message}</p>
        `;
    }
}

function displayValidationResults(result) {
    const outputsSection = document.getElementById('outputs');
    const resultsDiv = document.getElementById('results');
    
    if (!outputsSection || !resultsDiv) {
        console.error("Required elements not found");
        return;
    }
    
    const overallResult = result.success ? 'Pass' : 'Fail';
    const statusClass = result.success ? 'pass' : 'fail';

    let htmlHeader = `
        <h3 class="title">Validation Results</h3>
        <div class="status ${statusClass}">${overallResult}</div>
    `;

    // Check if header already exists
    let headerElement = outputsSection.querySelector('header');
    if (headerElement) {
        // Update existing header
        headerElement.innerHTML = htmlHeader;
    } else {
        // Create new header
        headerElement = document.createElement('header');
        headerElement.innerHTML = htmlHeader;
        outputsSection.insertBefore(headerElement, resultsDiv);
    }
    
    let html = '';

    if (result.allAttempts && result.allAttempts.length > 0) {
        const lastAttempt = result.allAttempts[result.allAttempts.length - 1];
        
        if (lastAttempt.validationResult && lastAttempt.validationResult.keyResults) {
            html += '<ul class="field-results">';

            lastAttempt.validationResult.keyResults.forEach(field => {
                const fieldIcon = field.isValid ? '✓' : '×';
                let llmValidationHtml = '';
                if (field.llmValidationResult) {
                    llmValidationHtml = `
                        <li>
                            <div class="llm-validation-result ${field.llmValidationResult.isValid ? 'passed' : 'failed'}">
                                LLM Validation: ${field.llmValidationResult.isValid ? 'Passed' : 'Failed'}
                                <div class="llm-validation-details">${field.llmValidationResult.reason}</div>
                            </div>
                        </li>
                    `;
                }
                html += `
                    <li class="field-result">
                        <ul>
                            <li><div class="field-label">field:</div><div>${field.key}</div><div class="field-icon ${field.isValid ? 'passed' : 'failed'}"></div></li>
                            <li><div class="type-label">type:</div><div>${field.type.expected}</div></li>
                            <li><div class="value-label">value:</div> <div class="value">${JSON.stringify(field.value)}</div></li>
                            ${llmValidationHtml}
                            ${field.error ? `<li><div class="error-label">error:</div><div>${field.error}</div></li>` : ''}
                        </ul>
                    </li>
                `;
            });

            html += '</ul>';
        }
    }

    if (result.error) {
        html += `<p class="error">${result.error}</p>`;
    }

    html += `
        <button id="toggleDetails" class="button toggle-button button-small">Details</button>
        <div id="detailedResults" style="display:none;">
    `;

    // Add cost information to detailedResults
    if (result.usage && result.cost) {
        html += `
            <div id="cost">
                <h4>Token Usage and Cost:</h4>
                <div class="input-tokens">Input Tokens: ${result.cost.inputTokens}</div>
                <div class="output-tokens">Output Tokens: ${result.cost.outputTokens}</div>
                <div class="total-tokens">Total Tokens: ${result.cost.totalTokens}</div>
                <div class="input-cost">Input Cost: $${result.cost.inputCost}</div>
                <div class="output-cost">Output Cost: $${result.cost.outputCost}</div>
                <div class="total-cost">Total Cost: $${result.cost.totalCost}</div>
                <div class="cost-per-thousand">Cost per 1K tokens: $${result.cost.costPerThousand}</div>
            </div>
        `;
    }

    html += `
            <div class="json-container">${jsonToHtml(result)}</div>
        </div>
    `;

    resultsDiv.innerHTML = html;

    document.getElementById('toggleDetails').addEventListener('click', function() {
        const detailedResults = document.getElementById('detailedResults');
        if (detailedResults.style.display === 'none') {
            detailedResults.style.display = 'block';
            this.textContent = 'Hide Details';
        } else {
            detailedResults.style.display = 'none';
            this.textContent = 'Details';
        }
    });
}

function jsonToHtml(obj, indent = 0) {
    const indentString = '  '.repeat(indent);
    let html = '';

    if (Array.isArray(obj)) {
        html += `<span class="json-bracket">[</span><br>`;
        obj.forEach((item, index) => {
            html += `${indentString}  ${jsonToHtml(item, indent + 1)}`;
            if (index < obj.length - 1) html += '<span class="json-comma">,</span>';
            html += '<br>';
        });
        html += `${indentString}<span class="json-bracket">]</span>`;
    } else if (typeof obj === 'object' && obj !== null) {
        html += `<span class="json-brace">{</span><br>`;
        const keys = Object.keys(obj);
        keys.forEach((key, index) => {
            html += `${indentString}  <span class="json-key">"${key}"</span>: ${jsonToHtml(obj[key], indent + 1)}`;
            if (index < keys.length - 1) html += '<span class="json-comma">,</span>';
            html += '<br>';
        });
        html += `${indentString}<span class="json-brace">}</span>`;
    } else if (typeof obj === 'string') {
        html += `<span class="json-string">"${obj}"</span>`;
    } else if (typeof obj === 'number' || typeof obj === 'boolean') {
        html += `<span class="json-${typeof obj}">${obj}</span>`;
    } else if (obj === null) {
        html += `<span class="json-null">null</span>`;
    }

    return html;
}

function populateModelDropdowns() {
    const models = Object.keys(MODEL_INFO);
    const promptModelSelect = document.getElementById('promptModel');
    const validatorModelSelect = document.getElementById('validatorModel');
  
    models.forEach(model => {
      const option = new Option(model, model);
      promptModelSelect.add(option.cloneNode(true));
      validatorModelSelect.add(option);
    });
}

function addSaveSchemaButton() {
    const buttonGroup = document.querySelector('.button-group.send');
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save Schema';
    saveButton.classList.add('button');
    saveButton.id = 'saveSchema';
    buttonGroup.appendChild(saveButton);

    saveButton.addEventListener('click', saveSchemaHandler);
}

async function saveSchemaHandler() {
    const formData = new FormData(document.getElementById('validationForm'));
    const data = {
        promptModel: formData.get('promptModel'),
        prompt: formData.get('prompt'),
        expectedStructure: []
    };

    const fields = document.querySelectorAll('.field-group');
    fields.forEach((field, index) => {
        const fieldId = index + 1;
        const fieldData = {
            key: formData.get(`key${fieldId}`),
            type: formData.get(`type${fieldId}`),
            description: formData.get(`description${fieldId}`)
        };

        data.expectedStructure.push(fieldData);
    });

    try {
        const response = await fetch('http://localhost:3000/api/save-schema', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (response.ok) {
            showAlert(`Schema saved successfully. Version: ${result.version}`);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showAlert(`Failed to save schema: ${error.message}`);
    }
}

function clearForm() {
    document.getElementById('prompt').value = '';
    document.getElementById('promptModel').selectedIndex = 0;
    document.getElementById('structureFields').innerHTML = '';
    fieldCount = 0;
}

function showAlert(message) { 
    const alertsDiv = document.getElementById('alerts');
    const alertMessage = alertsDiv.querySelector('p');
    const closeButton = alertsDiv.querySelector('div');

    alertMessage.textContent = message;
    alertsDiv.style.display = 'flex';
    alertsDiv.style.animation = 'slideDown 0.5s forwards';

    closeButton.onclick = function() {
        alertsDiv.style.animation = 'slideUp 0.5s forwards';
        setTimeout(() => {
            alertsDiv.style.display = 'none';
        }, 500);
    };

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (alertsDiv.style.display !== 'none') {
            closeButton.click();
        }
    }, 3000);
}

async function loadSchemaHandler() {
    try {
        const schemas = await fetch('http://localhost:3000/api/list-schemas').then(res => res.json());
        
        if (schemas.length === 0) {
            alert('No saved schemas found.');
            return;
        }

        const version = prompt(`Enter the version number to load:\n${schemas.map(s => `Version ${s.version}`).join('\n')}`);
        
        if (!version) return;

        const response = await fetch(`http://localhost:3000/api/load-schema/${version}`);
        const schema = await response.json();

        if (response.ok) {
            clearForm();
            populateForm(schema);
            showAlert(`Schema version ${version} loaded successfully.`);
        } else {
            throw new Error(schema.error);
        }
    } catch (error) {
        console.error("Failed to load schema:", error);
        showAlert(`Failed to load schema: ${error.message}`);
    }
}

function populateForm(schema) {
    console.log("Populating form with schema:", schema);

    const promptModelSelect = document.getElementById('promptModel');
    const promptTextarea = document.getElementById('prompt');

    if (promptModelSelect) promptModelSelect.value = schema.promptModel;
    if (promptTextarea) promptTextarea.value = schema.prompt;

    schema.expectedStructure.forEach((field) => {
        addField();
        const fieldId = fieldCount;
        
        const keyInput = document.querySelector(`input[name="key${fieldId}"]`);
        const typeInput = document.querySelector(`input[name="type${fieldId}"]`);
        const descriptionInput = document.querySelector(`input[name="description${fieldId}"]`);

        if (keyInput) keyInput.value = field.key;
        if (typeInput) typeInput.value = field.type;
        if (descriptionInput) descriptionInput.value = field.description || '';

        const typeToggle = document.querySelector(`#field${fieldId} .toggle-group`);
        if (typeToggle) {
            const typeButton = typeToggle.querySelector(`.toggle-button[data-type="${field.type}"]`);
            if (typeButton) typeButton.click();
        }
    });

    console.log("Form populated successfully");
}

async function displaySavedSchemas() {
    try {
        const response = await fetch('http://localhost:3000/api/list-schemas');
        const schemas = await response.json();

        const schemaList = document.getElementById('schema-list');
        schemaList.innerHTML = schemas.map(schema => `
            <div class="schema-item" data-version="${schema.version}">
                Schema v${schema.version}
            </div>
        `).join('');

        schemaList.querySelectorAll('.schema-item').forEach(item => {
            item.addEventListener('click', function() {
                const version = this.getAttribute('data-version');
                loadSchema(version);
            });
        });
    } catch (error) {
        console.error("Failed to fetch schemas:", error);
        document.getElementById('schema-list').innerHTML = '<p>Failed to load schemas</p>';
    }
}

async function loadSchema(version) {
    try {
        const response = await fetch(`http://localhost:3000/api/load-schema/${version}`);
        const schema = await response.json();

        if (response.ok) {
            clearForm();
            populateForm(schema);
            showAlert(`Schema version ${version} loaded successfully.`);
            document.getElementById('side-panel').classList.remove('open');
            document.querySelector('main').classList.remove('panel-open');
        } else {
            throw new Error(schema.error);
        }
    } catch (error) {
        console.error("Failed to load schema:", error);
        showAlert(`Failed to load schema: ${error.message}`);
    }
}

// Initialize with one field
// addField();