function bootstrap_inputs(fields, values) {
	return Object.entries(fields).reduce((a, [k, v]) => `${a}<div class="form-floating mb-3">
<input type="${v.type}" class="form-control ${v.class?? ""}" id="${k}" name="${k}"
	${values? `value="${values instanceof Map? values.get(k) : values[k]}"`: ""}
	placeholder="${v.placeholder ?? ' '}"
	${v.pattern? `pattern="${v.pattern}"` : ""}
	${v.autocomplete? `autocomplete=${v.autocomplete}` : ""}
	${v.optional? "" : "required"}>
<label for="${k}" class="form-label">${v.label}</label>
</div>`, "");
}

customElements.define("toast-container", class ToastWebcomponent extends HTMLElement {
	connectedCallback() {
		this.classList.add("toast-container", "position-fixed", "p-3", "z-3", "top-0", "end-0");
		addEventListener("error", e => this.showToast({ title: "Page error", messasge: e.message, style: "text-bg-warning" }));
		addEventListener("toast-error", e => this.showToast({ ...e.detail, style:'text-bg-warning'}));
		addEventListener("toast-success", e => this.showToast({ ...e.detail, style:'text-bg-success'}));
	}
	showToast({ title, message, id, style = "text-bg-info", autohide = true, dismissable = true, delay = 4000 }) {
		if (id) {
			const e = this.querySelector(`[data-id="${id}"]`);
			const x = bootstrap.Toast.getInstance(e)
			if(x) x.hide()
		}
		const e = document.createElement("div");
		e.classList.add("toast", "hide");
		e.dataset.id = id;
		e.innerHTML = `
			${!title && autohide || !dismissable ? "" :
				`<div class=toast-header>
				${title ? `<strong class="me-auto toast-title">${title}</strong>` : ""}
				${autohide || !dismissable ? "" : "<button type=button class=btn-close data-bs-dismiss=toast aria-label=Close></button>"}
			</div>`}
			${message? `<div class=toast-body>${message}</div>` : ""}`;
		if (style) e.classList.add(style);
		e.addEventListener('hidden.bs.toast', _ => e.remove());
		this.appendChild(e);
		const t = new bootstrap.Toast(e, { autohide, delay });
		t.show();
	}
});

customElements.define("submit-button", class SubmitButton extends HTMLElement{
	connectedCallback() {
		this.innerHTML = `
		<button type="submit" class="btn btn-primary">
			<span class="spinner-border spinner-border-sm d-none" aria-hidden="true"></span>
			${this.innerHTML}
		</button>
		<span class="alert alert-warning d-none p-3"></span>`;
		this.button = this.querySelector("button");
		this.button.form.addEventListener("submit", this);
	}
	handleEvent(e) {
		if (e.type === "submit") this.busy();
	}
	busy() {
		this.button.disabled = true;
		this.button.querySelector(".spinner-border").classList.remove("d-none");
	}
	available() {
		this.button.querySelector(".spinner-border").classList.add("d-none");
		this.button.disabled = false;
	}
	message(m, type = "alert-warning") {
		const a = this.querySelector(".alert");
		a.innerHTML = m;
		a.classList.add(type);
		a.classList.remove("d-none")
	}
})

const ListGroup = (base) => class extends base {
	connectedCallback() {
		super.connectedCallback?.()
		this.classList.add("list-group")
		this.addEventListener("addItem", e => this.addItem(e.detail))
		this.addEventListener("addItems", e => this.addItems(e.detail))
		this.addEventListener("clearItems", e => this.clearItems(e.detail))
		this.addEventListener("setItems", e => this.setItems(e.detail))
	}
	itemHTML(item) {
		return `<div class="list-group-item">${item}</div>`
	}
	addItem(item) {
		this.innerHTML += this.itemHTML(item)
	}
	addItems(items) {
		let html = ""
		for(const item of items)
			html += this.itemHTML(item)
		this.innerHTML += html;
	}
	setItems(items) {
		let html = ""
		for(const item of items)
			html += this.itemHTML(item)
		this.innerHTML = html;
	}
	clearItems() {
		this.replaceChildren()
	}
};
customElements.define("list-group", ListGroup(HTMLElement))