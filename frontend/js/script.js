/* =========================================================
   Ledger — Modern SaaS Expense Management Dashboard JS
   State management, API integration, interactive Chart.js charts,
   Indian Rupee formatting, advanced search/filters, pagination,
   theme toggling, keyboard shortcuts, and custom modal dialogs.
   ========================================================= */

const API_BASE = "http://127.0.0.1:5000/api";

// ---- Application State ----
const state = {
  token: localStorage.getItem("ledger-token") || null,
  user: null,
  activeView: "dashboard",
  theme: localStorage.getItem("ledger-theme") || "light",
  categories: [],
  expenses: [],
  summary: null,
  pagination: {
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 1
  },
  filters: {
    search: "",
    category: "All",
    start: "",
    end: "",
    sortBy: "date",
    sortOrder: "desc"
  },
  editingId: null,
  deleteCandidate: null,
  searchDebounceTimer: null
};

// ---- Chart Instances ----
let categoryChartInstance = null;
let monthChartInstance = null;
let weekChartInstance = null;

// ---- Category Color Palette & Class Mapping ----
const CATEGORY_MAP = {
  "Food": { class: "tag-food", color: "#F39C12" },
  "Transport": { class: "tag-transport", color: "#1ABC9C" },
  "Shopping": { class: "tag-shopping", color: "#3498DB" },
  "Bills": { class: "tag-bills", color: "#E74C3C" },
  "Entertainment": { class: "tag-entertainment", color: "#9B59B6" },
  "Health": { class: "tag-health", color: "#2ECC71" },
  "Education": { class: "tag-education", color: "#F1C40F" },
  "Other": { class: "tag-other", color: "#95A5A6" }
};

// ---- Element References ----
const els = {
  // Navigation & Header
  todayDate: document.getElementById("today-date"),
  pageTitle: document.getElementById("page-title"),
  sidebar: document.getElementById("sidebar"),
  mobileMenuToggle: document.getElementById("mobile-menu-toggle"),
  themeToggle: document.getElementById("theme-toggle"),

  // Views
  dashboardView: document.getElementById("dashboard-view"),
  entriesView: document.getElementById("entries-view"),
  recurringView: document.getElementById("recurring-view"),
  incomesView: document.getElementById("incomes-view"),

  // Recurring Elements
  recurringRows: document.getElementById("recurring-rows"),
  recurringEmpty: document.getElementById("recurring-empty"),
  openRecurringModalBtn: document.getElementById("open-recurring-modal-btn"),
  recurringModalOverlay: document.getElementById("recurring-modal-overlay"),
  closeRecurringModalBtn: document.getElementById("close-recurring-modal-btn"),
  reqCancelBtn: document.getElementById("req-cancel-btn"),
  reqForm: document.getElementById("recurring-form"),
  reqFormError: document.getElementById("req-form-error"),

  // Incomes Elements
  incomesRows: document.getElementById("incomes-rows"),
  incomesEmpty: document.getElementById("incomes-empty"),
  openIncomeModalBtn: document.getElementById("open-income-modal-btn"),
  incomeModalOverlay: document.getElementById("income-modal-overlay"),
  closeIncomeModalBtn: document.getElementById("close-income-modal-btn"),
  incCancelBtn: document.getElementById("inc-cancel-btn"),
  incForm: document.getElementById("income-form"),
  incFormError: document.getElementById("inc-form-error"),

  // Auth Elements
  authModalOverlay: document.getElementById("auth-modal-overlay"),
  authForm: document.getElementById("auth-form"),
  authTitle: document.getElementById("auth-title"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authToggleBtn: document.getElementById("auth-toggle-btn"),
  authSubmitBtn: document.getElementById("auth-submit-btn"),
  authFormError: document.getElementById("auth-form-error"),
  logoutBtn: document.getElementById("logout-btn"),
  authStatusContainer: document.getElementById("auth-status-container"),
  userEmailDisplay: document.getElementById("user-email-display"),

  // Metrics
  statTotal: document.getElementById("stat-total"),
  statCount: document.getElementById("stat-count"),
  statAvg: document.getElementById("stat-avg"),
  statMax: document.getElementById("stat-max"),
  statMonth: document.getElementById("stat-month"),
  statPrevMonth: document.getElementById("stat-prev-month"),
  monthTrendBadge: document.getElementById("month-trend-badge"),
  statTopCategory: document.getElementById("stat-top-category"),
  statBalance: document.getElementById("stat-balance"),
  statIncome: document.getElementById("stat-income"),
  insightsBanner: document.getElementById("insights-banner"),
  insightsList: document.getElementById("insights-list"),

  // Filters & Table Toolbar
  searchInput: document.getElementById("search-input"),
  categoryFilter: document.getElementById("category-filter"),
  startDate: document.getElementById("start-date"),
  endDate: document.getElementById("end-date"),
  sortBy: document.getElementById("sort-by"),
  sortOrder: document.getElementById("sort-order"),
  clearFiltersBtn: document.getElementById("clear-filters-btn"),
  tableExportBtn: document.getElementById("table-export-btn"),
  quickExportBtn: document.getElementById("quick-export-btn"),

  // Table & Pagination
  expenseRows: document.getElementById("expense-rows"),
  tableEmpty: document.getElementById("table-empty"),
  emptyStateMessage: document.getElementById("empty-state-message"),
  emptyAddBtn: document.getElementById("empty-add-btn"),
  paginationInfo: document.getElementById("pagination-info"),
  pageSizeSelect: document.getElementById("page-size-select"),
  prevPageBtn: document.getElementById("prev-page-btn"),
  nextPageBtn: document.getElementById("next-page-btn"),
  pageDisplay: document.getElementById("page-display"),

  // Modals & Buttons
  openModalBtn: document.getElementById("open-modal-btn"),
  sidebarAddBtn: document.getElementById("sidebar-add-btn"),
  modalOverlay: document.getElementById("modal-overlay"),
  modalTitle: document.getElementById("modal-title"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  cancelBtn: document.getElementById("cancel-btn"),
  form: document.getElementById("expense-form"),
  formError: document.getElementById("form-error"),

  // Details Modal
  detailsModalOverlay: document.getElementById("details-modal-overlay"),
  detailsBody: document.getElementById("details-body"),
  closeDetailsBtn: document.getElementById("close-details-btn"),
  detailsCloseBtn: document.getElementById("details-close-btn"),
  detailsEditBtn: document.getElementById("details-edit-btn"),

  // Delete Modal
  deleteModalOverlay: document.getElementById("delete-modal-overlay"),
  deleteItemPreview: document.getElementById("delete-item-preview"),
  closeDeleteBtn: document.getElementById("close-delete-btn"),
  cancelDeleteBtn: document.getElementById("cancel-delete-btn"),
  confirmDeleteBtn: document.getElementById("confirm-delete-btn"),

  // Shortcuts Modal
  shortcutsBtn: document.getElementById("shortcuts-btn"),
  shortcutsModalOverlay: document.getElementById("shortcuts-modal-overlay"),
  closeShortcutsBtn: document.getElementById("close-shortcuts-btn"),
  shortcutsOkBtn: document.getElementById("shortcuts-ok-btn"),

  // Toast Container
  toastContainer: document.getElementById("toast-container")
};

// ---- Helper Functions ----

/**
 * Formats a number as Indian Rupee (₹1,25,000.00).
 */
function currency(n) {
  const val = Number(n) || 0;
  return "₹" + val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into user-friendly string (e.g. 27 Aug 2026).
 */
function formatDate(isoStr) {
  if (!isoStr) return "—";
  const [y, m, d] = isoStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  const today = new Date();
  if (dateObj.toDateString() === today.toDateString()) {
    return "Today";
  }

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateObj.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return dateObj.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Sanitizes HTML string to prevent XSS attacks.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Displays toast notifications.
 */
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

/**
 * Centralized API Communication Wrapper.
 */
async function api(path, options = {}) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (state.token) {
      headers["Authorization"] = `Bearer ${state.token}`;
    }

    const config = {
      headers: { ...headers, ...(options.headers || {}) },
      ...options
    };

    const res = await fetch(`${API_BASE}${path}`, config);
    const result = await res.json().catch(() => ({ success: false, error: "Invalid API JSON response" }));

    if (!res.ok || result.success === false) {
      if (res.status === 401 && !path.includes("/auth/login")) {
        handleLogout();
      }
      const errorMsg = result.error || result.message || `HTTP Error ${res.status}`;
      throw new Error(errorMsg);
    }
    return result;
  } catch (err) {
    console.error(`API Error on [${path}]:`, err);
    throw err;
  }
}

// ---- Initialization ----
document.addEventListener("DOMContentLoaded", async () => {
  applyTheme(state.theme);

  els.todayDate.textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  setupEventListeners();

  if (!state.token) {
    try {
      const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: "demo@ledger.com", password: "demo123" }) });
      state.token = res.data.token;
      state.user = { email: res.data.email };
      localStorage.setItem("ledger-token", state.token);
    } catch(e) {
      showAuthModal();
      return;
    }
  }

  try {
    const me = await api("/auth/me");
    state.user = me.data;
    updateAuthUI();
    await initAppData();
  } catch(e) {
    handleLogout();
  }
});

async function initAppData() {
  try {
    await loadCategories();
    try {
      await api("/recurring/process", { method: "POST" });
    } catch (e) {
      console.warn("Failed to process recurring expenses", e);
    }
    await refreshAllData();
  } catch (err) {
    showToast("Backend connection failed. Please ensure app.py is running.", "error");
  }
}

// ---- Theme Handling ----
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("ledger-theme", theme);
}

function toggleTheme() {
  const newTheme = state.theme === "light" ? "dark" : "light";
  applyTheme(newTheme);
  // Re-render charts with updated theme grid/font colors
  if (state.summary) {
    renderCategoryChart(state.summary.byCategory);
    renderMonthChart(state.summary.byMonth);
    renderWeekChart(state.summary.byWeek);
  }
}

// ---- Auth Logic ----
let authMode = "login";
function showAuthModal() {
  authMode = "login";
  updateAuthModalUI();
  els.authModalOverlay.style.display = "flex";
}
function updateAuthModalUI() {
  if (authMode === "login") {
    els.authTitle.textContent = "Sign In";
    els.authSubmitBtn.textContent = "Sign In";
    els.authToggleBtn.textContent = "Create Account";
  } else {
    els.authTitle.textContent = "Create Account";
    els.authSubmitBtn.textContent = "Sign Up";
    els.authToggleBtn.textContent = "Sign In instead";
  }
  if (els.authFormError) els.authFormError.textContent = "";
}
function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("ledger-token");
  if (els.authStatusContainer) els.authStatusContainer.style.display = "none";
  showAuthModal();
}
function updateAuthUI() {
  if (state.user) {
    if (els.authStatusContainer) els.authStatusContainer.style.display = "block";
    if (els.userEmailDisplay) els.userEmailDisplay.textContent = state.user.email;
    if (els.authModalOverlay) els.authModalOverlay.style.display = "none";
  }
}

// ---- Event Listeners Setup ----
function setupEventListeners() {
  // Navigation & Theme
  els.mobileMenuToggle.addEventListener("click", () => {
    els.sidebar.classList.toggle("open");
  });

  els.themeToggle.addEventListener("click", toggleTheme);

  if (els.authToggleBtn) {
    els.authToggleBtn.addEventListener("click", () => {
      authMode = authMode === "login" ? "register" : "login";
      updateAuthModalUI();
    });
    
    els.authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = els.authEmail.value;
      const password = els.authPassword.value;
      els.authFormError.textContent = "";
      
      if (authMode === "login") {
        try {
          const res = await api("/auth/login", { method: "POST", body: JSON.stringify({email, password})});
          state.token = res.data.token;
          state.user = { email: res.data.email };
          localStorage.setItem("ledger-token", state.token);
          els.authForm.reset();
          updateAuthUI();
          await initAppData();
          showToast("Logged in successfully");
        } catch(err) {
          els.authFormError.textContent = err.message || "Login failed";
        }
      } else {
        try {
          await api("/auth/register", { method: "POST", body: JSON.stringify({email, password})});
          showToast("Account created! Please sign in.");
          authMode = "login";
          updateAuthModalUI();
          els.authPassword.value = "";
        } catch(err) {
          els.authFormError.textContent = err.message || "Registration failed";
        }
      }
    });
    
    const demoBtn = document.getElementById("demo-login-btn");
    if (demoBtn) {
      demoBtn.addEventListener("click", async () => {
        try {
          const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: "demo@ledger.com", password: "demo123" }) });
          state.token = res.data.token;
          state.user = { email: res.data.email };
          localStorage.setItem("ledger-token", state.token);
          updateAuthUI();
          await initAppData();
          showToast("Logged in to Demo Account");
        } catch(err) {
          showToast("Demo login failed: " + err.message, "error");
        }
      });
    }

    els.logoutBtn.addEventListener("click", handleLogout);
  }

  // Budget Modal Event Listeners
  const openBudgetBtn = document.getElementById("open-budget-modal-btn");
  const closeBudgetBtn = document.getElementById("close-budget-modal-btn");
  const budgetCancelBtn = document.getElementById("budget-cancel-btn");
  const budgetModalOverlay = document.getElementById("budget-modal-overlay");
  const budgetForm = document.getElementById("budget-form");

  if (openBudgetBtn) {
    openBudgetBtn.addEventListener("click", () => {
      const catSelect = document.getElementById("budget-category");
      if (catSelect) {
        catSelect.innerHTML = state.categories.map((c) => `<option value="${c}">${c}</option>`).join("");
      }
      document.getElementById("budget-limit").value = "";
      document.getElementById("budget-form-error").textContent = "";
      toggleModal(budgetModalOverlay, true);
    });
  }
  if (closeBudgetBtn) closeBudgetBtn.addEventListener("click", () => toggleModal(budgetModalOverlay, false));
  if (budgetCancelBtn) budgetCancelBtn.addEventListener("click", () => toggleModal(budgetModalOverlay, false));
  if (budgetModalOverlay) {
    budgetModalOverlay.addEventListener("click", (e) => {
      if (e.target === budgetModalOverlay) toggleModal(budgetModalOverlay, false);
    });
  }
  if (budgetForm) {
    budgetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const category = document.getElementById("budget-category").value;
      const limit_amount = parseFloat(document.getElementById("budget-limit").value);
      const errEl = document.getElementById("budget-form-error");
      if (!category || isNaN(limit_amount) || limit_amount <= 0) {
        if (errEl) errEl.textContent = "Please enter a valid positive limit amount.";
        return;
      }
      try {
        await api("/budgets", { method: "POST", body: JSON.stringify({ category, limit_amount }) });
        showToast("Category budget updated successfully");
        toggleModal(budgetModalOverlay, false);
        await refreshAllData();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || "Failed to save budget.";
      }
    });
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Action Buttons
  els.openModalBtn.addEventListener("click", () => openExpenseModal());
  els.sidebarAddBtn.addEventListener("click", () => openExpenseModal());
  els.emptyAddBtn.addEventListener("click", () => openExpenseModal());

  if (els.openRecurringModalBtn) {
    els.openRecurringModalBtn.addEventListener("click", () => {
      els.reqForm.reset();
      els.reqFormError.textContent = "";
      document.getElementById("req-date").value = new Date().toISOString().split("T")[0];
      const categorySelect = document.getElementById("req-category");
      if (categorySelect.options.length === 0) {
        categorySelect.innerHTML = state.categories.map((c) => `<option value="${c}">${c}</option>`).join("");
      }
      toggleModal(els.recurringModalOverlay, true);
    });
    
    els.closeRecurringModalBtn.addEventListener("click", () => toggleModal(els.recurringModalOverlay, false));
    els.reqCancelBtn.addEventListener("click", () => toggleModal(els.recurringModalOverlay, false));
    els.recurringModalOverlay.addEventListener("click", (e) => {
      if (e.target === els.recurringModalOverlay) toggleModal(els.recurringModalOverlay, false);
    });
    
    els.reqForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("req-title").value.trim();
      const amount = document.getElementById("req-amount").value;
      const date = document.getElementById("req-date").value;
      const category = document.getElementById("req-category").value;
      const frequency = document.getElementById("req-frequency").value;
      const notes = document.getElementById("req-notes").value.trim();
      
      if (!title || !amount || !date || !category || !frequency) {
        els.reqFormError.textContent = "Please fill in all required fields.";
        return;
      }
      
      try {
        await api("/recurring", {
          method: "POST",
          body: JSON.stringify({ title, amount, date, category, frequency, notes })
        });
        showToast("Recurring expense created");
        toggleModal(els.recurringModalOverlay, false);
        els.reqForm.reset();
        await loadRecurringExpenses();
        await refreshAllData();
      } catch (err) {
        els.reqFormError.textContent = err.message || "Failed to save";
      }
    });
  }

  if (els.openIncomeModalBtn) {
    els.openIncomeModalBtn.addEventListener("click", () => {
      els.incForm.reset();
      els.incFormError.textContent = "";
      document.getElementById("inc-date").value = new Date().toISOString().split("T")[0];
      toggleModal(els.incomeModalOverlay, true);
    });
    
    els.closeIncomeModalBtn.addEventListener("click", () => toggleModal(els.incomeModalOverlay, false));
    els.incCancelBtn.addEventListener("click", () => toggleModal(els.incomeModalOverlay, false));
    els.incomeModalOverlay.addEventListener("click", (e) => {
      if (e.target === els.incomeModalOverlay) toggleModal(els.incomeModalOverlay, false);
    });
    
    els.incForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const source = document.getElementById("inc-source").value.trim();
      const amount = document.getElementById("inc-amount").value;
      const date = document.getElementById("inc-date").value;
      const notes = document.getElementById("inc-notes").value.trim();
      
      if (!source || !amount || !date) {
        els.incFormError.textContent = "Please fill in all required fields.";
        return;
      }
      
      try {
        await api("/incomes", {
          method: "POST",
          body: JSON.stringify({ source, amount, date, notes })
        });
        showToast("Income created");
        toggleModal(els.incomeModalOverlay, false);
        els.incForm.reset();
        await loadIncomes();
        await refreshAllData();
      } catch (err) {
        els.incFormError.textContent = err.message || "Failed to save";
      }
    });
  }

  els.quickExportBtn.addEventListener("click", handleCSVExport);
  els.tableExportBtn.addEventListener("click", handleCSVExport);
  els.shortcutsBtn.addEventListener("click", () => toggleModal(els.shortcutsModalOverlay, true));

  // Add / Edit Modal Actions
  els.closeModalBtn.addEventListener("click", () => toggleModal(els.modalOverlay, false));
  els.cancelBtn.addEventListener("click", () => toggleModal(els.modalOverlay, false));
  els.modalOverlay.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) toggleModal(els.modalOverlay, false);
  });
  els.form.addEventListener("submit", handleFormSubmit);

  // Details Modal Actions
  els.closeDetailsBtn.addEventListener("click", () => toggleModal(els.detailsModalOverlay, false));
  els.detailsCloseBtn.addEventListener("click", () => toggleModal(els.detailsModalOverlay, false));

  // Delete Modal Actions
  els.closeDeleteBtn.addEventListener("click", () => toggleModal(els.deleteModalOverlay, false));
  els.cancelDeleteBtn.addEventListener("click", () => toggleModal(els.deleteModalOverlay, false));
  els.confirmDeleteBtn.addEventListener("click", executeExpenseDelete);

  // Shortcuts Modal Actions
  els.closeShortcutsBtn.addEventListener("click", () => toggleModal(els.shortcutsModalOverlay, false));
  els.shortcutsOkBtn.addEventListener("click", () => toggleModal(els.shortcutsModalOverlay, false));

  // Filter & Search Controls
  els.searchInput.addEventListener("input", (e) => {
    clearTimeout(state.searchDebounceTimer);
    state.searchDebounceTimer = setTimeout(() => {
      state.filters.search = e.target.value.trim();
      state.pagination.page = 1;
      loadExpenses();
    }, 300);
  });

  els.categoryFilter.addEventListener("change", (e) => {
    state.filters.category = e.target.value;
    state.pagination.page = 1;
    loadExpenses();
  });

  els.startDate.addEventListener("change", (e) => {
    state.filters.start = e.target.value;
    state.pagination.page = 1;
    loadExpenses();
  });

  els.endDate.addEventListener("change", (e) => {
    state.filters.end = e.target.value;
    state.pagination.page = 1;
    loadExpenses();
  });

  els.sortBy.addEventListener("change", (e) => {
    state.filters.sortBy = e.target.value;
    loadExpenses();
  });

  els.sortOrder.addEventListener("change", (e) => {
    state.filters.sortOrder = e.target.value;
    loadExpenses();
  });

  els.clearFiltersBtn.addEventListener("click", resetFilters);

  // Pagination Controls
  els.pageSizeSelect.addEventListener("change", (e) => {
    state.pagination.limit = parseInt(e.target.value, 10);
    state.pagination.page = 1;
    loadExpenses();
  });

  els.prevPageBtn.addEventListener("click", () => {
    if (state.pagination.page > 1) {
      state.pagination.page--;
      loadExpenses();
    }
  });

  els.nextPageBtn.addEventListener("click", () => {
    if (state.pagination.page < state.pagination.totalPages) {
      state.pagination.page++;
      loadExpenses();
    }
  });

  // Global Keyboard Shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

// ---- Keyboard Shortcuts Handler ----
function handleKeyboardShortcuts(e) {
  // Don't intercept shortcut when typing in inputs/textareas
  const isInputTarget = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);

  if (e.key === "Escape") {
    toggleModal(els.modalOverlay, false);
    toggleModal(els.detailsModalOverlay, false);
    toggleModal(els.deleteModalOverlay, false);
    toggleModal(els.shortcutsModalOverlay, false);
    if (els.recurringModalOverlay) toggleModal(els.recurringModalOverlay, false);
    els.sidebar.classList.remove("open");
    return;
  }

  if (e.key === "?" && !isInputTarget) {
    e.preventDefault();
    toggleModal(els.shortcutsModalOverlay, true);
    return;
  }

  if ((e.key === "/" || (e.ctrlKey && e.key.toLowerCase() === "f")) && !isInputTarget) {
    e.preventDefault();
    switchView("entries");
    els.searchInput.focus();
    return;
  }

  if (e.altKey && e.key.toLowerCase() === "n") {
    e.preventDefault();
    openExpenseModal();
    return;
  }
}

// ---- View Switching ----
function switchView(viewName) {
  state.activeView = viewName;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  if (viewName === "entries") {
    els.dashboardView.style.display = "none";
    els.entriesView.style.display = "block";
    if (els.recurringView) els.recurringView.style.display = "none";
    if (els.incomesView) els.incomesView.style.display = "none";
    els.pageTitle.textContent = "Expense Records";
  } else if (viewName === "recurring") {
    els.dashboardView.style.display = "none";
    els.entriesView.style.display = "none";
    if (els.recurringView) els.recurringView.style.display = "block";
    if (els.incomesView) els.incomesView.style.display = "none";
    els.pageTitle.textContent = "Recurring Expenses";
    loadRecurringExpenses();
  } else if (viewName === "incomes") {
    els.dashboardView.style.display = "none";
    els.entriesView.style.display = "none";
    if (els.recurringView) els.recurringView.style.display = "none";
    if (els.incomesView) els.incomesView.style.display = "block";
    els.pageTitle.textContent = "Income Management";
    loadIncomes();
  } else {
    els.dashboardView.style.display = "block";
    els.entriesView.style.display = "none";
    if (els.recurringView) els.recurringView.style.display = "none";
    if (els.incomesView) els.incomesView.style.display = "none";
    els.pageTitle.textContent = "Financial Overview";
  }

  // Close mobile sidebar menu if open
  els.sidebar.classList.remove("open");
}

// ---- Load Data Functions ----
async function refreshAllData() {
  await Promise.all([loadSummaryData(), loadExpenses()]);
}

async function loadCategories() {
  const response = await api("/categories");
  state.categories = response.data || [];

  // Populate Select options
  const optionsHtml = state.categories
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");

  document.getElementById("category").innerHTML = optionsHtml;
  els.categoryFilter.innerHTML = `<option value="All">All Categories</option>${optionsHtml}`;
}

async function loadSummaryData() {
  try {
    const response = await api("/summary");
    const summary = response.data;
    state.summary = summary;

    // Populate Cards
    els.statBalance.textContent = currency(summary.balance);
    els.statIncome.textContent = currency(summary.totalIncome);
    els.statTotal.textContent = currency(summary.totalSpent);
    els.statCount.textContent = summary.totalCount;
    els.statAvg.textContent = currency(summary.avgExpense);
    els.statMax.textContent = currency(summary.maxExpense);
    els.statMonth.textContent = currency(summary.currentMonthSpent);
    els.statPrevMonth.textContent = `vs ${currency(summary.prevMonthSpent)} last month`;
    els.statTopCategory.textContent = summary.topCategory || "—";

    // Trend Badge
    const pct = summary.monthChangePct;
    if (pct > 0) {
      els.monthTrendBadge.textContent = `+${pct}%`;
      els.monthTrendBadge.className = "trend-badge up";
    } else if (pct < 0) {
      els.monthTrendBadge.textContent = `${pct}%`;
      els.monthTrendBadge.className = "trend-badge down";
    } else {
      els.monthTrendBadge.textContent = "0%";
      els.monthTrendBadge.className = "trend-badge neutral";
    }

    // Populate Dynamic Insights Banner
    if (summary.insights && summary.insights.length > 0) {
      els.insightsBanner.style.display = "flex";
      els.insightsList.innerHTML = summary.insights.map((msg) => `<p>${escapeHtml(msg)}</p>`).join("");
    } else {
      els.insightsBanner.style.display = "none";
    }

    // Render Budgets
    renderBudgets(summary.budgets);

    // Render Charts
    renderCategoryChart(summary.byCategory);
    renderMonthChart(summary.byMonth);
    renderWeekChart(summary.byWeek);

    // Remove skeleton state
    document.querySelectorAll(".card-skeleton").forEach((card) => card.classList.remove("card-skeleton"));
  } catch (err) {
    showToast("Failed to load summary statistics", "error");
  }
}

function renderBudgets(budgets = []) {
  const container = document.getElementById("budget-list");
  if (!container) return;
  if (!budgets || budgets.length === 0) {
    container.innerHTML = '<div class="empty-note" style="grid-column: 1 / -1; display: block;">No category budgets set. Click "+ Set Budget" to start tracking limits.</div>';
    return;
  }
  container.innerHTML = budgets.map((b) => {
    const pct = Math.min(b.utilization_pct || 0, 100);
    const isOver = (b.spent_amount || 0) > b.limit_amount;
    const barColor = isOver ? "#EF4444" : (pct > 80 ? "#F59E0B" : "#10B981");
    return `
      <div class="card" style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 600; font-size: 0.95rem;">${escapeHtml(b.category)}</span>
          <button class="row-action-btn delete-budget-btn" data-id="${b.id}" title="Remove Budget" style="padding: 2px 6px;">&times;</button>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 6px;">
          <span>${currency(b.spent_amount)} spent</span>
          <span>limit: ${currency(b.limit_amount)}</span>
        </div>
        <div style="background: var(--bg-input); height: 8px; border-radius: 4px; overflow: hidden;">
          <div style="width: ${pct}%; background: ${barColor}; height: 100%; transition: width 0.3s ease;"></div>
        </div>
        <span style="font-size: 0.75rem; color: ${barColor}; display: block; margin-top: 4px; font-family: var(--font-mono);">
          ${isOver ? "Over budget!" : `${b.utilization_pct}% used`}
        </span>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".delete-budget-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/budgets/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Budget removed");
        await refreshAllData();
      } catch (err) {
        showToast("Failed to delete budget", "error");
      }
    });
  });
}

async function loadExpenses() {
  try {
    const queryParams = new URLSearchParams({
      page: state.pagination.page,
      limit: state.pagination.limit,
      category: state.filters.category,
      start: state.filters.start,
      end: state.filters.end,
      search: state.filters.search,
      sort_by: state.filters.sortBy,
      order: state.filters.sortOrder
    });

    const response = await api(`/expenses?${queryParams.toString()}`);
    state.expenses = response.data || [];
    state.pagination = response.pagination || state.pagination;

    renderExpensesTable();
    renderPaginationControls();
  } catch (err) {
    showToast("Failed to load expenses list", "error");
  }
}

// ---- Recurring Logic ----
async function loadRecurringExpenses() {
  if (!els.recurringView) return;
  try {
    const response = await api("/recurring");
    const data = response.data || [];
    
    if (data.length === 0) {
      els.recurringRows.innerHTML = "";
      els.recurringEmpty.style.display = "block";
      return;
    }
    
    els.recurringEmpty.style.display = "none";
    els.recurringRows.innerHTML = data.map(req => {
      const catConfig = CATEGORY_MAP[req.category] || CATEGORY_MAP["Other"];
      return `
        <tr>
          <td>
            <span class="expense-title">${escapeHtml(req.title)}</span>
            ${req.notes ? `<span class="expense-notes">${escapeHtml(req.notes)}</span>` : ""}
          </td>
          <td>
            <span class="category-tag ${catConfig.class}">
              ${escapeHtml(req.category)}
            </span>
          </td>
          <td>${escapeHtml(req.frequency)}</td>
          <td>${formatDate(req.next_date)}</td>
          <td class="num">${currency(req.amount)}</td>
          <td class="actions-col">
            <button class="row-action-btn delete-req-action" data-id="${req.id}" title="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `;
    }).join("");
    
    els.recurringRows.querySelectorAll(".delete-req-action").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (confirm("Stop and delete this recurring expense?")) {
          try {
            await api(`/recurring/${btn.dataset.id}`, { method: "DELETE" });
            showToast("Recurring expense deleted");
            loadRecurringExpenses();
          } catch (e) {
            showToast("Failed to delete", "error");
          }
        }
      });
    });
  } catch (e) {
    showToast("Failed to load recurring expenses", "error");
  }
}

// ---- Incomes Logic ----
async function loadIncomes() {
  if (!els.incomesView) return;
  try {
    const response = await api("/incomes");
    const data = response.data || [];
    
    if (data.length === 0) {
      els.incomesRows.innerHTML = "";
      els.incomesEmpty.style.display = "block";
      return;
    }
    
    els.incomesEmpty.style.display = "none";
    els.incomesRows.innerHTML = data.map(inc => `
      <tr>
        <td>${formatDate(inc.date)}</td>
        <td>
          <span class="expense-title">${escapeHtml(inc.source)}</span>
          ${inc.notes ? `<span class="expense-notes">${escapeHtml(inc.notes)}</span>` : ""}
        </td>
        <td class="num" style="color: #10b981;">+${currency(inc.amount)}</td>
        <td class="actions-col">
          <button class="row-action-btn delete-inc-action" data-id="${inc.id}" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      </tr>
    `).join("");
    
    els.incomesRows.querySelectorAll(".delete-inc-action").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (confirm("Delete this income record?")) {
          try {
            await api(`/incomes/${btn.dataset.id}`, { method: "DELETE" });
            showToast("Income deleted");
            loadIncomes();
          } catch (e) {
            showToast("Failed to delete", "error");
          }
        }
      });
    });
  } catch (e) {
    showToast("Failed to load incomes", "error");
  }
}

// ---- Render Table & Pagination ----
function renderExpensesTable() {
  if (state.expenses.length === 0) {
    els.expenseRows.innerHTML = "";
    els.tableEmpty.style.display = "block";
    return;
  }

  els.tableEmpty.style.display = "none";
  els.expenseRows.innerHTML = state.expenses
    .map((e) => {
      const catConfig = CATEGORY_MAP[e.category] || CATEGORY_MAP["Other"];
      return `
        <tr data-id="${e.id}">
          <td>${formatDate(e.date)}</td>
          <td>
            <span class="expense-title">${escapeHtml(e.title)}</span>
            ${e.notes ? `<span class="expense-notes">${escapeHtml(e.notes)}</span>` : ""}
          </td>
          <td>
            <span class="category-tag ${catConfig.class}">
              ${escapeHtml(e.category)}
            </span>
          </td>
          <td class="num">${currency(e.amount)}</td>
          <td class="actions-col">
            <div class="row-actions">
              <button class="row-action-btn view-action" data-id="${e.id}" title="View Details">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
              <button class="row-action-btn edit-action" data-id="${e.id}" title="Edit">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="row-action-btn delete-action" data-id="${e.id}" title="Delete">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  // Attach Table Action Listeners
  els.expenseRows.querySelectorAll(".view-action").forEach((btn) => {
    btn.addEventListener("click", () => openExpenseDetails(btn.dataset.id));
  });

  els.expenseRows.querySelectorAll(".edit-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expense = state.expenses.find((x) => String(x.id) === btn.dataset.id);
      if (expense) openExpenseModal(expense);
    });
  });

  els.expenseRows.querySelectorAll(".delete-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expense = state.expenses.find((x) => String(x.id) === btn.dataset.id);
      if (expense) promptDeleteConfirmation(expense);
    });
  });
}

function renderPaginationControls() {
  const { page, limit, totalCount, totalPages } = state.pagination;
  const startItem = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalCount);

  els.paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalCount} entries`;
  els.pageDisplay.textContent = `Page ${page} of ${totalPages || 1}`;

  els.prevPageBtn.disabled = page <= 1;
  els.nextPageBtn.disabled = page >= totalPages;
}

function resetFilters() {
  state.filters = {
    search: "",
    category: "All",
    start: "",
    end: "",
    sortBy: "date",
    sortOrder: "desc"
  };
  state.pagination.page = 1;

  els.searchInput.value = "";
  els.categoryFilter.value = "All";
  els.startDate.value = "";
  els.endDate.value = "";
  els.sortBy.value = "date";
  els.sortOrder.value = "desc";

  loadExpenses();
}

// ---- Modal Toggle Helper ----
function toggleModal(modalEl, show) {
  if (show) {
    modalEl.classList.add("open");
  } else {
    modalEl.classList.remove("open");
  }
}

// ---- Expense Modal (Add / Edit) ----
function openExpenseModal(expense = null) {
  state.editingId = expense ? expense.id : null;
  els.modalTitle.textContent = expense ? "Edit Expense Entry" : "New Expense Entry";
  els.formError.textContent = "";

  document.getElementById("expense-id").value = expense ? expense.id : "";
  document.getElementById("title").value = expense ? expense.title : "";
  document.getElementById("amount").value = expense ? expense.amount : "";
  document.getElementById("date").value = expense ? expense.date : new Date().toISOString().split("T")[0];
  document.getElementById("category").value = expense ? expense.category : (state.categories[0] || "Food");
  document.getElementById("notes").value = expense ? expense.notes || "" : "";

  toggleModal(els.modalOverlay, true);
  setTimeout(() => document.getElementById("title").focus(), 100);
}

async function handleFormSubmit(e) {
  e.preventDefault();
  els.formError.textContent = "";

  const title = document.getElementById("title").value.trim();
  const amount = parseFloat(document.getElementById("amount").value);
  const expenseDate = document.getElementById("date").value;
  const category = document.getElementById("category").value;
  const notes = document.getElementById("notes").value.trim();

  // Frontend Validation
  if (!title) {
    els.formError.textContent = "Please enter an expense title.";
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    els.formError.textContent = "Please enter a valid amount greater than zero.";
    return;
  }
  if (!expenseDate) {
    els.formError.textContent = "Please select a valid date.";
    return;
  }

  const payload = { title, amount, date: expenseDate, category, notes };

  try {
    if (state.editingId) {
      await api(`/expenses/${state.editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Expense entry updated successfully");
    } else {
      await api("/expenses", { method: "POST", body: JSON.stringify(payload) });
      showToast("Expense recorded successfully");
    }

    toggleModal(els.modalOverlay, false);
    els.form.reset();
    state.editingId = null;
    await refreshAllData();
  } catch (err) {
    els.formError.textContent = err.message || "Failed to save expense entry.";
  }
}

// ---- Details Modal ----
function openExpenseDetails(expenseId) {
  const expense = state.expenses.find((x) => String(x.id) === String(expenseId));
  if (!expense) return;

  const catConfig = CATEGORY_MAP[expense.category] || CATEGORY_MAP["Other"];

  els.detailsBody.innerHTML = `
    <div class="detail-field">
      <span class="detail-label">Title</span>
      <div class="detail-value">${escapeHtml(expense.title)}</div>
    </div>
    <div class="detail-field">
      <span class="detail-label">Amount</span>
      <div class="detail-value" style="color:var(--accent-rust);">${currency(expense.amount)}</div>
    </div>
    <div class="detail-field">
      <span class="detail-label">Category</span>
      <div style="margin-top:4px;">
        <span class="category-tag ${catConfig.class}">${escapeHtml(expense.category)}</span>
      </div>
    </div>
    <div class="detail-field">
      <span class="detail-label">Date</span>
      <div class="detail-value" style="font-size:0.95rem;">${formatDate(expense.date)} (${expense.date})</div>
    </div>
    ${expense.notes ? `
    <div class="detail-field">
      <span class="detail-label">Notes</span>
      <div style="font-size:0.92rem; background:var(--bg-input); padding:10px; border-radius:6px; margin-top:4px;">
        ${escapeHtml(expense.notes)}
      </div>
    </div>` : ""}`;

  els.detailsEditBtn.onclick = () => {
    toggleModal(els.detailsModalOverlay, false);
    openExpenseModal(expense);
  };

  toggleModal(els.detailsModalOverlay, true);
}

// ---- Delete Confirmation Modal ----
function promptDeleteConfirmation(expense) {
  state.deleteCandidate = expense;
  els.deleteItemPreview.innerHTML = `
    <strong>${escapeHtml(expense.title)}</strong><br>
    Amount: ${currency(expense.amount)} | Category: ${escapeHtml(expense.category)} | Date: ${expense.date}
  `;
  toggleModal(els.deleteModalOverlay, true);
}

async function executeExpenseDelete() {
  if (!state.deleteCandidate) return;

  try {
    await api(`/expenses/${state.deleteCandidate.id}`, { method: "DELETE" });
    showToast("Expense record deleted");
    toggleModal(els.deleteModalOverlay, false);
    state.deleteCandidate = null;
    await refreshAllData();
  } catch (err) {
    showToast(err.message || "Failed to delete expense", "error");
  }
}

// ---- CSV Export Handler ----
function handleCSVExport() {
  const queryParams = new URLSearchParams({
    category: state.filters.category,
    start: state.filters.start,
    end: state.filters.end,
    search: state.filters.search
  });
  window.location.href = `${API_BASE}/expenses/export?${queryParams.toString()}`;
  showToast("CSV export download started");
}

// ---- Chart.js Rendering Logic ----
function getChartThemeColors() {
  const isDark = state.theme === "dark";
  return {
    textColor: isDark ? "#94A3B8" : "#626A77",
    gridColor: isDark ? "#222D3E" : "#EFECE6",
    fontFamily: "Inter, sans-serif"
  };
}

function renderCategoryChart(byCategory = []) {
  const panel = document.getElementById("categoryChart").closest(".chart-card");
  if (!byCategory || byCategory.length === 0) {
    panel.classList.add("is-empty");
    return;
  }
  panel.classList.remove("is-empty");

  const ctx = document.getElementById("categoryChart").getContext("2d");
  const theme = getChartThemeColors();

  const labels = byCategory.map((c) => c.category);
  const dataValues = byCategory.map((c) => c.total);
  const bgColors = byCategory.map((c) => (CATEGORY_MAP[c.category] ? CATEGORY_MAP[c.category].color : "#95A5A6"));

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  categoryChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: dataValues,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: state.theme === "dark" ? "#18202C" : "#FFFFFF"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: { family: theme.fontFamily, size: 12 },
            color: theme.textColor,
            padding: 14,
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${currency(ctx.raw)}`
          }
        }
      },
      cutout: "65%"
    }
  });
}

function renderMonthChart(byMonth = []) {
  const panel = document.getElementById("monthChart").closest(".chart-card");
  if (!byMonth || byMonth.length === 0) {
    panel.classList.add("is-empty");
    return;
  }
  panel.classList.remove("is-empty");

  const ctx = document.getElementById("monthChart").getContext("2d");
  const theme = getChartThemeColors();

  const labels = byMonth.map((m) => {
    const [y, mo] = m.month.split("-");
    return new Date(y, mo - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  });

  const dataValues = byMonth.map((m) => m.total);

  if (monthChartInstance) {
    monthChartInstance.destroy();
  }

  monthChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Monthly Spent",
        data: dataValues,
        backgroundColor: state.theme === "dark" ? "#3B82F6" : "#1C232E",
        borderRadius: 6,
        maxBarThickness: 44
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Spent: ${currency(ctx.raw)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => "₹" + v,
            color: theme.textColor,
            font: { family: "IBM Plex Mono", size: 11 }
          },
          grid: { color: theme.gridColor }
        },
        x: {
          ticks: {
            color: theme.textColor,
            font: { family: theme.fontFamily, size: 12 }
          },
          grid: { display: false }
        }
      }
    }
  });
}

function renderWeekChart(byWeek = []) {
  const panel = document.getElementById("weekChart").closest(".chart-card");
  if (!byWeek || byWeek.length === 0) {
    panel.classList.add("is-empty");
    return;
  }
  panel.classList.remove("is-empty");

  const ctx = document.getElementById("weekChart").getContext("2d");
  const theme = getChartThemeColors();

  const labels = byWeek.map((w) => {
    if (w.week_start) {
      return formatDate(w.week_start);
    }
    return `W${w.week}`;
  });

  const dataValues = byWeek.map((w) => w.total);

  if (weekChartInstance) {
    weekChartInstance.destroy();
  }

  weekChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Weekly Spent",
        data: dataValues,
        borderColor: state.theme === "dark" ? "#10B981" : "#2E7D52",
        backgroundColor: state.theme === "dark" ? "rgba(16, 185, 129, 0.15)" : "rgba(46, 125, 82, 0.1)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Spent: ${currency(ctx.raw)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => "₹" + v,
            color: theme.textColor,
            font: { family: "IBM Plex Mono", size: 11 }
          },
          grid: { color: theme.gridColor }
        },
        x: {
          ticks: {
            color: theme.textColor,
            font: { family: theme.fontFamily, size: 11 }
          },
          grid: { display: false }
        }
      }
    }
  });
}

