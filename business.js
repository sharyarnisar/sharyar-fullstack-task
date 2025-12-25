const contact_fields = {
	name: { label: "Name" },
	position: { label: "Position" },
	email: { label: "Email", type: "email" },
	invoiceEmail: { label: "Invoice email (Optional)", type: "email", required: false },
	telephone: { 
		label: "Telephone", 
		type: "tel", 
		pattern: "^(0|\\+?44)7\\d{9}$|^(0|\\+?44)1\\d{8,9}$",
		placeholder: "e.g., 07123456789 or +447123456789",
		validationMsg: "Please enter a valid UK phone number (mobile: 07XXXXXXXXX or +447XXXXXXXXX, landline: 01XXXXXXXXX or +441XXXXXXXXX)"
	}
}

const address = { label: "Address", type: "address" }
const name = { label: "Name" }

const businessType = { 
	limitedCompany: {
		name: "Limited Company",
		fields: {
			name,
			number: { label: "Number", placeholder: "01234567" },
			address
		}
	},
	soleTrader: {
		name: "Sole Trader",
		fields: { name, address }
	},
	partnership: {
		name: "Partnership",
		fields: {
			name, address,
			partners: { label: "Partner names"}
		}
	}
}

function bootstrap_inputs(fields, values) {
	return Object.entries(fields).reduce((a, [k, v]) => {
		const value = values ? (values instanceof Map ? values.get(k) : values[k]) : "";
		const validationMsg = v.validationMsg || "";
		return `${a}<div class="form-floating mb-3">
			<input type="${v.type || "text"}" class="form-control" id="${k}" name="${k}"
				${value ? `value="${value}"` : ""}
				placeholder="${v.placeholder ?? ' '}"
				${v.pattern ? `pattern="${v.pattern}"` : ""}
				${v.required === false ? "" : "required"}
				data-validation-msg="${validationMsg}">
			<label for="${k}" class="form-label">${v.label}</label>
			<div class="invalid-feedback d-none">
				<i class="bi bi-exclamation-circle"></i> <span class="error-text"></span>
			</div>
		</div>`;
	}, "");
}

// LocalStorage persistence utility
const StorageManager = {
	save: function(key, data) {
		try {
			localStorage.setItem(key, JSON.stringify(data));
		} catch (e) {
			console.error('Failed to save to localStorage:', e);
		}
	},
	load: function(key) {
		try {
			const data = localStorage.getItem(key);
			return data ? JSON.parse(data) : null;
		} catch (e) {
			console.error('Failed to load from localStorage:', e);
			return null;
		}
	},
	clear: function(key) {
		try {
			localStorage.removeItem(key);
		} catch (e) {
			console.error('Failed to clear localStorage:', e);
		}
	}
}

// CSV Export utility
function exportToCSV(data, filename = 'pharmacists.csv') {
	const headers = ['GPHC Number', 'Full Name'];
	const rows = data.map(p => [p.gphc, p.name]);
	const csvContent = [
		headers.join(','),
		...rows.map(row => row.map(cell => `"${cell}"`).join(','))
	].join('\n');
	
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.visibility = 'hidden';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

// Loading overlay utility
function showLoading() {
	if (document.getElementById('loadingOverlay')) return;
	const overlay = document.createElement('div');
	overlay.id = 'loadingOverlay';
	overlay.className = 'loading-overlay';
	overlay.innerHTML = '<div class="loading-spinner"></div>';
	document.body.appendChild(overlay);
}

function hideLoading() {
	const overlay = document.getElementById('loadingOverlay');
	if (overlay) overlay.remove();
}

// Enhanced validation messages
function showValidationMessage(input, message, isValid) {
	const feedback = input.parentElement.querySelector('.invalid-feedback');
	const errorText = feedback?.querySelector('.error-text');
	if (feedback && errorText) {
		if (isValid) {
			feedback.classList.add('d-none');
			input.classList.remove('is-invalid');
			input.classList.add('is-valid');
		} else {
			errorText.textContent = message;
			feedback.classList.remove('d-none');
			input.classList.remove('is-valid');
			input.classList.add('is-invalid');
		}
	}
}

customElements.define('business-application', class BusinessApplication extends HTMLElement {
	constructor() {
		super();
		this.pharmacists = [];
		this.draggedElement = null;
	}

	connectedCallback() {
		this.addEventListener("submit", this);
		this.addEventListener("click", this);
		this.addEventListener("keydown", this);
		this.addEventListener("input", this);
		this.addEventListener("change", this);
		this.addEventListener("journal-post", (e) => this.handleJournalPost(e));
		
		// Load saved data
		this.loadFromStorage();
		this.viewChanged();
		
		// Auto-save on input
		this.setupAutoSave();
	}

	setupAutoSave() {
		const form = this.querySelector('form');
		if (form) {
			form.addEventListener('input', () => {
				setTimeout(() => this.saveToStorage(), 500);
			});
		}
	}

	saveToStorage() {
		const form = this.querySelector('form');
		if (!form) return;
		
		const formData = new FormData(form);
		const data = {
			businessType: form.querySelector('[name="businessType"]:checked')?.value || '',
			business: {},
			contact: {},
			ods: [],
			pharmacists: this.pharmacists
		};

		// Save business fields
		const businessFieldset = form.querySelector('#business');
		if (businessFieldset) {
			businessFieldset.querySelectorAll('input').forEach(input => {
				data.business[input.name] = input.value;
			});
		}

		// Save contact fields
		Object.keys(contact_fields).forEach(key => {
			const input = form.querySelector(`[name="${key}"]`);
			if (input) data.contact[key] = input.value;
		});

		// Save ODS codes
		form.querySelectorAll('input[name="ods"]').forEach(input => {
			if (input.value.trim()) data.ods.push(input.value.trim());
		});

		StorageManager.save('businessApplication', data);
	}

	loadFromStorage() {
		const saved = StorageManager.load('businessApplication');
		if (saved) {
			this.savedData = saved;
			if (saved.pharmacists) {
				this.pharmacists = saved.pharmacists;
			}
		}
	}

	handleEvent(e) {
		if (e.target.name === "businessType") {
			this.businessType(e.target.value);
			this.saveToStorage();
			return;
		}
		if (e.target.name === "remove") {
			const entry = e.target.closest('pharmacy-ods-input, pharmacist-entry');
			if (entry) {
				if (entry.tagName === 'PHARMACIST-ENTRY') {
					const gphc = entry.getAttribute('gphc');
					this.pharmacists = this.pharmacists.filter(p => p.gphc !== gphc);
				}
				entry.remove();
				this.saveToStorage();
			}
			return;
		}
		if (e.target.name === "addPharmacy" || (e.target.id === "ods" && e.type === "keydown" && e.key === "Enter")) {
			if (e.type === "keydown") e.preventDefault();
			this.addPharmacy();
			return;
		}
		if (e.target.name === "addPharmacist" || 
			((e.target.id === "gphc" || e.target.id === "pharmacistName") && e.type === "keydown" && e.key === "Enter")) {
			if (e.type === "keydown") e.preventDefault();
			this.addPharmacist();
			return;
		}
		if (e.target.name === "exportCSV") {
			this.exportPharmacistsCSV();
			return;
		}
		if (e.target.name === "clearForm") {
			if (confirm('Are you sure you want to clear all form data? This cannot be undone.')) {
				this.clearForm();
			}
			return;
		}
		if (e.type === "input" || e.type === "change") {
			// Real-time validation
			if (e.target.matches('input[pattern], input[type="email"], input[type="tel"]')) {
				this.validateField(e.target);
			}
			this.saveToStorage();
		}
		if (e.type === "submit") {
			e.preventDefault();
			e.stopPropagation();
			this.submitForm(e.target);
		}
	}

	addPharmacy() {
		const input = this.querySelector("#ods");
		const odsValue = input.value.trim().toUpperCase();
		if (!odsValue) {
			showValidationMessage(input, "Please enter an ODS code", false);
			input.focus();
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Please enter an ODS code", style: "text-bg-warning" } }));
			return;
		}
		const odsPattern = /^[A-Z]{2,3}\d{2,3}$/;
		if (!odsPattern.test(odsValue)) {
			showValidationMessage(input, "Invalid format. Use format like AB123", false);
			input.focus();
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Invalid ODS code format. Use format like AB123", style: "text-bg-warning" } }));
			return;
		}
		showValidationMessage(input, "", true);
		this.querySelector("#pharmacies").innerHTML += `<pharmacy-ods-input ods="${odsValue}"></pharmacy-ods-input>`;
		input.value = "";
		input.focus();
		this.saveToStorage();
	}

	addPharmacist() {
		const gphcInput = this.querySelector("#gphc");
		const nameInput = this.querySelector("#pharmacistName");
		const gphcValue = gphcInput.value.trim();
		const nameValue = nameInput.value.trim();
		
		if (!gphcValue || !nameValue) {
			if (!gphcValue) {
				showValidationMessage(gphcInput, "GPHC number is required", false);
				gphcInput.focus();
			}
			if (!nameValue) {
				showValidationMessage(nameInput, "Name is required", false);
				nameInput.focus();
			}
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Please enter both GPHC number and name", style: "text-bg-warning" } }));
			return;
		}
		
		const gphcPattern = /^\d{7}$/;
		if (!gphcPattern.test(gphcValue)) {
			showValidationMessage(gphcInput, "GPHC number must be exactly 7 digits", false);
			gphcInput.focus();
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "GPHC number must be exactly 7 digits", style: "text-bg-warning" } }));
			return;
		}

		// Check for duplicates
		if (this.pharmacists.some(p => p.gphc === gphcValue)) {
			showValidationMessage(gphcInput, "This GPHC number is already added", false);
			gphcInput.focus();
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "This GPHC number is already in the list", style: "text-bg-warning" } }));
			return;
		}

		showValidationMessage(gphcInput, "", true);
		showValidationMessage(nameInput, "", true);
		
		const pharmacist = { gphc: gphcValue, name: nameValue };
		this.pharmacists.push(pharmacist);
		this.renderPharmacists();
		gphcInput.value = "";
		nameInput.value = "";
		gphcInput.focus();
		this.saveToStorage();
	}

	exportPharmacistsCSV() {
		if (this.pharmacists.length === 0) {
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "No pharmacists to export", style: "text-bg-warning" } }));
			return;
		}
		exportToCSV(this.pharmacists, `pharmacists_${new Date().toISOString().split('T')[0]}.csv`);
		dispatchEvent(new CustomEvent("toast-success", { detail: { message: "Pharmacist list exported successfully", style: "text-bg-success" } }));
	}

	clearForm() {
		StorageManager.clear('businessApplication');
		this.pharmacists = [];
		this.savedData = null;
		const form = this.querySelector('form');
		if (form) form.reset();
		this.viewChanged();
		dispatchEvent(new CustomEvent("toast-success", { detail: { message: "Form cleared successfully", style: "text-bg-success" } }));
	}

	validateField(input) {
		const value = input.value.trim();
		const pattern = input.pattern;
		const type = input.type;

		if (input.required && !value) {
			showValidationMessage(input, "This field is required", false);
			return false;
		}

		if (value && pattern) {
			const regex = new RegExp(pattern);
			if (!regex.test(value)) {
				const customMsg = input.getAttribute('data-validation-msg') || "Invalid format";
				showValidationMessage(input, customMsg, false);
				return false;
			}
		}

		if (type === "email" && value) {
			const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailPattern.test(value)) {
				showValidationMessage(input, "Please enter a valid email address", false);
				return false;
			}
		}

		if (type === "tel" && value) {
			const telPattern = /^(0|\+?44)[71]\d{8,9}$/;
			if (!telPattern.test(value)) {
				const customMsg = input.getAttribute('data-validation-msg') || "Please enter a valid UK phone number";
				showValidationMessage(input, customMsg, false);
				return false;
			}
		}

		if (input.id === "gphc" && value) {
			if (!/^\d{7}$/.test(value)) {
				showValidationMessage(input, value.length === 7 ? "GPHC number must be exactly 7 digits" : "GPHC number must be 7 digits", false);
				return false;
			}
		}

		showValidationMessage(input, "", true);
		return true;
	}

	submitForm(form) {
		// Validate business type
		const businessTypeInput = form.querySelector('[name="businessType"]:checked');
		if (!businessTypeInput) {
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Please select a business type", style: "text-bg-warning" } }));
			return;
		}

		// Validate business fields
		const businessFieldset = form.querySelector('#business');
		const businessInputs = businessFieldset?.querySelectorAll('input[required]') || [];
		let hasInvalid = false;
		businessInputs.forEach(input => {
			if (!this.validateField(input)) hasInvalid = true;
		});
		if (hasInvalid) {
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Please fill in all required business fields", style: "text-bg-warning" } }));
			return;
		}

		// Validate contact fields
		Object.keys(contact_fields).forEach(key => {
			const input = form.querySelector(`[name="${key}"]`);
			if (input && !this.validateField(input)) hasInvalid = true;
		});
		if (hasInvalid) {
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Please correct the errors in contact information", style: "text-bg-warning" } }));
			return;
		}

		// Validate ODS codes
		const odsInputs = form.querySelectorAll('input[name="ods"]');
		if (odsInputs.length === 0) {
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Please add at least one pharmacy ODS code", style: "text-bg-warning" } }));
			this.querySelector("#ods")?.focus();
			return;
		}

		let hasInvalidODS = false;
		odsInputs.forEach(input => {
			const odsPattern = /^[A-Z]{2,3}\d{2,3}$/;
			if (!odsPattern.test(input.value.trim())) {
				showValidationMessage(input, "Invalid ODS format", false);
				hasInvalidODS = true;
			}
		});
		if (hasInvalidODS) {
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Please correct invalid ODS codes", style: "text-bg-warning" } }));
			return;
		}

		// Validate HTML5 validation
		if (!form.checkValidity()) {
			form.reportValidity();
			return;
		}

		const id = this.getAttribute("k");
		const data = new FormData(form);
		if (id) data.append('id', id);

		// Collect ODS codes
		const odsCodes = Array.from(odsInputs).map(input => input.value.trim()).filter(v => v);
		data.delete('ods');
		odsCodes.forEach(ods => data.append('ods', ods));

		// Add pharmacists
		if (this.pharmacists.length > 0) {
			data.append('pharmacists', JSON.stringify(this.pharmacists));
		}

		const detail = { type: id ? "business-accept" : "business-application", data };
		const event = new CustomEvent("journal-post", { bubbles: true, detail });
		this.dispatchEvent(event);
	}

	handleJournalPost(e) {
		e.stopPropagation();
		const { type, data } = e.detail;
		
		const submitButton = this.querySelector('button[type="submit"]');
		if (submitButton) {
			submitButton.disabled = true;
			submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';
			showLoading();
			
			setTimeout(() => {
				hideLoading();
				this.result({ reply: ['success'], error: false, target: submitButton });
				StorageManager.clear('businessApplication');
				this.pharmacists = [];
			}, 1000);
		}
	}

	businessType(type, values) {
		if (type && businessType[type]) {
			const businessFieldset = this.querySelector("#business");
			if (businessFieldset) {
				const saved = this.savedData?.business || values || {};
				businessFieldset.innerHTML = bootstrap_inputs(businessType[type].fields, saved);
			}
		}
	}

	renderPharmacists() {
		const container = this.querySelector("#pharmacists");
		if (!container) return;
		
		if (this.pharmacists.length === 0) {
			container.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No pharmacists added yet</p></div>';
			return;
		}

		container.innerHTML = this.pharmacists.map((p, index) => 
			`<pharmacist-entry gphc="${p.gphc}" name="${p.name.replace(/"/g, '&quot;')}" data-index="${index}"></pharmacist-entry>`
		).join('');
		
		// Setup drag and drop
		this.setupDragAndDrop();
	}

	setupDragAndDrop() {
		const container = this.querySelector("#pharmacists");
		if (!container) return;

		container.querySelectorAll('pharmacist-entry').forEach(entry => {
			entry.setAttribute('draggable', 'true');
			entry.addEventListener('dragstart', (e) => {
				this.draggedElement = entry;
				entry.classList.add('dragging');
				e.dataTransfer.effectAllowed = 'move';
			});
			entry.addEventListener('dragend', () => {
				entry.classList.remove('dragging');
				this.draggedElement = null;
			});
			entry.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				const afterElement = this.getDragAfterElement(container, e.clientY);
				if (afterElement == null) {
					container.appendChild(this.draggedElement);
				} else {
					container.insertBefore(this.draggedElement, afterElement);
				}
			});
		});
	}

	getDragAfterElement(container, y) {
		const draggableElements = [...container.querySelectorAll('pharmacist-entry:not(.dragging)')];
		return draggableElements.reduce((closest, child) => {
			const box = child.getBoundingClientRect();
			const offset = y - box.top - box.height / 2;
			if (offset < 0 && offset > closest.offset) {
				return { offset: offset, element: child };
			} else {
				return closest;
			}
		}, { offset: Number.NEGATIVE_INFINITY }).element;
	}

	viewChanged() {
		const saved = this.savedData || {};
		const values = {
			businessType: saved.businessType,
			business: saved.business,
			contact: saved.contact,
			ods: saved.ods || [],
			pharmacists: this.pharmacists
		};

		this.innerHTML = `<form novalidate>
	<div class="card-modern">
		<div class="card-header-modern">
			<div class="icon"><i class="bi bi-building"></i></div>
			<h3>Business Type</h3>
		</div>
		<div class="business-type-selector">
			${Object.entries(businessType).map(([k, v]) => `
				<label class="business-type-option ${values?.businessType === k ? 'selected' : ''}">
					<input type="radio" name="businessType" value="${k}" ${values?.businessType === k ? 'checked' : ''} required>
					<div style="font-weight: 600; margin-top: 0.5rem;">${v.name}</div>
				</label>
			`).join('')}
		</div>
		<fieldset id="business" name="business">
			${values?.businessType ? bootstrap_inputs(businessType[values.businessType].fields, values.business) : 
				'<div class="alert-info-modern"><i class="bi bi-info-circle"></i> Please select a business type above to continue</div>'}
		</fieldset>
	</div>
	
	<div class="card-modern">
		<div class="card-header-modern">
			<div class="icon"><i class="bi bi-person"></i></div>
			<h3>Contact Information</h3>
		</div>
		<fieldset name="contact">
			${bootstrap_inputs(contact_fields, values?.contact)}
		</fieldset>
	</div>
	
	<div class="card-modern">
		<div class="card-header-modern">
			<div class="icon"><i class="bi bi-shop"></i></div>
			<h3>Pharmacies</h3>
		</div>
		<p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Add ODS codes for each pharmacy (format: AB123)</p>
		<fieldset id="pharmacies" style="min-height: 3rem;">
			${(values?.ods || []).map(ods => `<pharmacy-ods-input ods="${ods}"></pharmacy-ods-input>`).join('')}
		</fieldset>
		<div class="input-group mb-3">
			<input class="form-control" id="ods" placeholder="Enter ODS code (e.g., AB123)" maxlength="6" style="text-transform: uppercase;">
			<button type="button" class="btn-modern" name="addPharmacy">
				<i class="bi bi-plus-circle"></i> Add Pharmacy
			</button>
		</div>
	</div>
	
	<div class="card-modern">
		<div class="card-header-modern">
			<div class="icon"><i class="bi bi-person-badge"></i></div>
			<h3>Pharmacists</h3>
		</div>
		<p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Add pharmacists with their GPHC registration numbers (7 digits)</p>
		<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
			<span style="color: var(--text-secondary); font-size: 0.9rem;">Total: ${this.pharmacists.length}</span>
			${this.pharmacists.length > 0 ? `<button type="button" class="btn-success-modern" name="exportCSV">
				<i class="bi bi-download"></i> Export CSV
			</button>` : ''}
		</div>
		<fieldset id="pharmacists" style="min-height: 3rem;">
		</fieldset>
		<div class="row g-3 mb-3">
			<div class="col-md-4">
				<div class="form-floating">
					<input type="text" class="form-control" id="gphc" placeholder="GPHC Number" maxlength="7" pattern="\\d{7}">
					<label for="gphc">GPHC Number (7 digits)</label>
					<div class="invalid-feedback d-none">
						<i class="bi bi-exclamation-circle"></i> <span class="error-text"></span>
					</div>
				</div>
			</div>
			<div class="col-md-6">
				<div class="form-floating">
					<input type="text" class="form-control" id="pharmacistName" placeholder="Full Name">
					<label for="pharmacistName">Full Name</label>
					<div class="invalid-feedback d-none">
						<i class="bi bi-exclamation-circle"></i> <span class="error-text"></span>
					</div>
				</div>
			</div>
			<div class="col-md-2">
				<button type="button" class="btn-modern w-100 h-100" name="addPharmacist">
					<i class="bi bi-plus-circle"></i> Add
				</button>
			</div>
		</div>
	</div>
	
	<div style="display: flex; gap: 1rem; margin-top: 2rem;">
		<button type="button" class="btn-outline-modern" name="clearForm">
			<i class="bi bi-trash"></i> Clear Form
		</button>
		<button type="submit" class="btn-modern" style="flex: 1;">
			<i class="bi bi-send"></i> ${values ? "Update Application" : "Submit Application"}
		</button>
	</div>
</form>`;

		// Setup GPHC validation
		const gphcInput = this.querySelector("#gphc");
		if (gphcInput) {
			gphcInput.addEventListener('input', (e) => {
				const value = e.target.value.replace(/\D/g, '').slice(0, 7);
				e.target.value = value;
				this.validateField(e.target);
			});
		}

		// Setup ODS uppercase
		const odsInput = this.querySelector("#ods");
		if (odsInput) {
			odsInput.addEventListener('input', (e) => {
				e.target.value = e.target.value.toUpperCase();
			});
		}

		// Render pharmacists
		this.renderPharmacists();

		// Setup business type change
		this.querySelectorAll('[name="businessType"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				this.businessType(e.target.value);
			});
		});

		// Load saved business type
		if (values?.businessType) {
			this.businessType(values.businessType, values.business);
		}
	}

	result({ reply, error, target }) {
		if(!reply || !reply.length || error) {
			hideLoading();
			dispatchEvent(new CustomEvent("toast-error", { detail: { message: error || "An error occurred while submitting the form", style: "text-bg-danger" } }));
			if (target) {
				target.disabled = false;
				target.innerHTML = '<i class="bi bi-send"></i> Submit Application';
			}
			return;
		}
		this.innerHTML = `<div class="alert-success-modern" style="margin: 2rem 0; padding: 2rem;">
			<h4 style="margin-bottom: 1rem;"><i class="bi bi-check-circle"></i> Application Submitted Successfully!</h4>
			<p>Your application has been posted. Our team will contact you with the next steps.</p>
		</div>`;

		dispatchEvent(new CustomEvent("toast-success", { detail: { message: "Application submitted successfully!", style: "text-bg-success" } }));
	}
})

customElements.define('ods-input', class ODSInput extends HTMLElement {
	connectedCallback() {
		this.addEventListener('change', this);
		this.addEventListener('input', this);
		const odsValue = this.getAttribute("ods") ?? "";
		this.innerHTML = `<input class="form-control" name="ods" value="${odsValue}" size=6 maxlength="6" placeholder="ODS code" style="text-transform: uppercase;">`;
		this.validate();
	}
	handleEvent(e) {
		this.validate();
	}
	validate() {
		const pattern = /^[A-Z]{2,3}\d{2,3}$/;
		const input = this.querySelector("input");
		const ods = input.value.trim().toUpperCase();
		input.value = ods;
		input.setCustomValidity('');
		input.classList.remove('is-invalid', 'is-valid');
		if (ods && !pattern.test(ods)) {
			input.setCustomValidity('Please correct the format: AB123');
			input.classList.add('is-invalid');
			return false;
		}
		if (ods && pattern.test(ods)) {
			input.classList.add('is-valid');
		}
		return true;
	}
})

customElements.define('pharmacy-ods-input', class PharmacyOdsInput extends HTMLElement {
	connectedCallback() {
		const ods = this.getAttribute("ods");
		this.classList.add('list-item');
		this.innerHTML = `
			<i class="bi bi-shop text-muted"></i>
			<ods-input ods="${ods ?? ''}" placeholder="ODS code"></ods-input>
			<button type="button" class="btn-danger-modern ms-auto" name="remove" title="Remove pharmacy">
				<i class="bi bi-x-circle"></i>
			</button>`;
	}
})

customElements.define('pharmacist-entry', class PharmacistEntry extends HTMLElement {
	constructor() {
		super();
		this.editingGPHC = false;
		this.editingName = false;
	}

	connectedCallback() {
		this.render();
		this.setupEventListeners();
	}

	render() {
		const gphc = this.getAttribute("gphc") ?? "";
		const name = this.getAttribute("name") ?? "";
		this.classList.add('list-item');
		this.innerHTML = `
			<i class="bi bi-grip-vertical drag-handle" style="cursor: grab;"></i>
			<div style="flex: 1; display: flex; gap: 1rem; align-items: center;">
				<div style="flex: 0 0 120px;">
					<span class="inline-edit ${this.editingGPHC ? 'editing' : ''}" data-field="gphc">
						${this.editingGPHC ? 
							`<input type="text" value="${gphc}" maxlength="7" pattern="\\d{7}" style="width: 100px;">` : 
							`<span>${gphc || 'N/A'}</span>`
						}
					</span>
				</div>
				<div style="flex: 1;">
					<span class="inline-edit ${this.editingName ? 'editing' : ''}" data-field="name">
						${this.editingName ? 
							`<input type="text" value="${name.replace(/"/g, '&quot;')}" style="width: 100%;">` : 
							`<span>${name || 'N/A'}</span>`
						}
					</span>
				</div>
			</div>
			<button type="button" class="btn-danger-modern" name="remove" title="Remove pharmacist">
				<i class="bi bi-x-circle"></i>
			</button>`;
	}

	setupEventListeners() {
		this.querySelectorAll('.inline-edit').forEach(edit => {
			edit.addEventListener('click', (e) => {
				if (!edit.classList.contains('editing')) {
					const field = edit.getAttribute('data-field');
					if (field === 'gphc') {
						this.editingGPHC = true;
					} else {
						this.editingName = true;
					}
					this.render();
					const input = edit.querySelector('input');
					if (input) {
						input.focus();
						input.select();
						input.addEventListener('blur', () => this.saveEdit(field, input.value));
						input.addEventListener('keydown', (e) => {
							if (e.key === 'Enter') {
								this.saveEdit(field, input.value);
							} else if (e.key === 'Escape') {
								this.cancelEdit(field);
							}
						});
					}
				}
			});
		});
	}

	saveEdit(field, value) {
		const trimmedValue = value.trim();
		if (field === 'gphc') {
			if (!/^\d{7}$/.test(trimmedValue)) {
				dispatchEvent(new CustomEvent("toast-error", { detail: { message: "GPHC number must be exactly 7 digits", style: "text-bg-warning" } }));
				this.cancelEdit(field);
				return;
			}
			this.setAttribute('gphc', trimmedValue);
			this.editingGPHC = false;
		} else {
			if (!trimmedValue) {
				dispatchEvent(new CustomEvent("toast-error", { detail: { message: "Name cannot be empty", style: "text-bg-warning" } }));
				this.cancelEdit(field);
				return;
			}
			this.setAttribute('name', trimmedValue);
			this.editingName = false;
		}
		
		// Update in parent component
		const app = this.closest('business-application');
		if (app) {
			const index = parseInt(this.getAttribute('data-index') || '0');
			if (app.pharmacists[index]) {
				app.pharmacists[index][field] = trimmedValue;
				app.saveToStorage();
			}
		}
		this.render();
	}

	cancelEdit(field) {
		if (field === 'gphc') {
			this.editingGPHC = false;
		} else {
			this.editingName = false;
		}
		this.render();
	}
})
