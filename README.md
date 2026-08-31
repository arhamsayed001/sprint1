# Ledger — Modern Expense Management Dashboard

A professional, production-grade **Expense Management SaaS Dashboard** built with Python (Flask + SQLite) backend, vanilla HTML5, CSS3, JavaScript (ES6+), and Chart.js visualizations.

---

## 🌟 Key Features

- **Professional Financial UI/UX**: SaaS-inspired aesthetic with dark/light mode toggle, modern typography (Inter, IBM Plex Mono, Fraunces), glassmorphism, responsive drawer navigation, skeleton loaders, and smooth micro-interactions.
- **6 Key Financial Summary Metrics**: Total Spent, Transaction Count, Average Expense, Highest Single Expense, Current Month Expenditure with Month-over-Month % change indicator, and Top Category.
- **Dynamic Smart Insights**: Automated narrative advice ("You spent 18% more this month", "Food is your highest category", "Your average transaction is ₹1,250.00").
- **Interactive Chart.js Visualizations**:
  - Category Breakdown (Doughnut Chart with custom tooltips)
  - Monthly Spending Trend (Bar Chart)
  - Weekly Spending Pattern (Area Line Chart)
- **Advanced Expense Table & Filtering**:
  - Debounced real-time title & notes search (`300ms`)
  - Filter by category and date range (`start_date` to `end_date`)
  - Multi-column sorting (by Date, Amount, Title in ASC/DESC order)
  - Server-side pagination with page size options (10, 20, 50, 100 rows per page)
  - One-click CSV Export (`ledger_expenses_YYYYMMDD.csv`)
  - Reset filters action
- **Comprehensive CRUD Operations**:
  - Add & Edit expense forms with modal backdrop blur
  - Expense detail inspection view modal
  - Custom styled confirmation dialog before deletion
  - Dynamic Toast notifications for immediate user feedback
- **Indian Rupee Formatting**: Automatic localization (`₹1,25,000.00`) and Indian date formatting (`27 Aug 2026`).
- **Keyboard Shortcuts**:
  - <kbd>Alt</kbd> + <kbd>N</kbd>: Open Add Expense Form
  - <kbd>/</kbd> or <kbd>Ctrl</kbd> + <kbd>F</kbd>: Focus Search Input
  - <kbd>Esc</kbd>: Close Active Modal
  - <kbd>?</kbd>: Open Keyboard Shortcuts Guide
- **Backend Security & Optimization**:
  - Strict server-side input validation for POST & PUT operations
  - Standardized JSON responses (`{"success": true, "data": ..., "message": "..."}`)
  - Parameterized SQLite queries protecting against SQL Injection
  - Database indexes on `date` and `category` fields for fast query response
  - Server Health Check endpoint (`/api/health`)

---

## 📁 Project Folder Structure

```
expense-tracker/
├── backend/
│   ├── app.py              # Flask REST API server & database logic
│   ├── requirements.txt    # Python package dependencies
│   └── expenses.db         # SQLite database file (auto-created on first run)
│
├── frontend/
│   ├── index.html          # Dashboard & Expenses single-page application markup
│   ├── css/
│   │   └── style.css       # Complete design system & dual-theme stylesheet
│   └── js/
│       └── script.js       # SPA state manager, Chart.js logic, API client
│
└── README.md               # Project documentation
```

---

## 🚀 Installation & Running Instructions

### Prerequisites
- Python 3.8+ installed on your system.
- Web browser (Chrome, Firefox, Edge, Safari).

---

### Step 1: Start the Python Backend API

Open a terminal or command prompt:

```bash
# Navigate to the backend directory
cd backend

# Create a virtual environment (optional but recommended)
python -m venv venv

# Activate virtual environment
# Windows (PowerShell / Command Prompt):
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start Flask Server
python app.py
```

The Flask API backend will launch at **`http://127.0.0.1:5000`**.  
The database `expenses.db` and required indexes will be created automatically on first run.

You can verify the backend status by visiting **`http://127.0.0.1:5000/api/health`** in your browser.

---

### Step 2: Open the Frontend Dashboard

Since the frontend is built using standard HTML5/CSS3/JS, you can serve it using Python's built-in HTTP server or VS Code Live Server.

**Method A: Python Built-in Server (Recommended)**

Open a second terminal window:

```bash
# Navigate to frontend directory
cd frontend

# Start HTTP server on port 5500
python -m http.server 5500
```

Open your browser and visit: **`http://127.0.0.1:5500`**

**Method B: VS Code Live Server**
1. Open the project folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `frontend/index.html` → **Open with Live Server**.

---

## 📡 API Reference Endpoint Table

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | API & Database health status | — |
| `GET` | `/api/categories` | Returns available expense categories | — |
| `GET` | `/api/expenses` | Filtered & paginated expenses list | `page`, `limit`, `category`, `start`, `end`, `search`, `sort_by`, `order` |
| `GET` | `/api/expenses/<id>` | Fetch single expense details | — |
| `POST` | `/api/expenses` | Add a new expense record | JSON: `title`, `amount`, `category`, `date`, `notes` |
| `PUT` | `/api/expenses/<id>` | Update an existing expense | JSON: `title`, `amount`, `category`, `date`, `notes` |
| `DELETE` | `/api/expenses/<id>` | Delete an expense record | — |
| `GET` | `/api/summary` | Aggregate dashboard stats & chart datasets | — |
| `GET` | `/api/expenses/export` | Download expenses CSV file stream | `category`, `start`, `end`, `search` |

### Sample API Responses

**Success Response (`POST /api/expenses`):**
```json
{
  "success": true,
  "data": {
    "id": 14,
    "title": "Groceries at D-Mart",
    "amount": 2450.50,
    "category": "Food",
    "date": "2026-08-27",
    "notes": "Weekly household essentials"
  },
  "message": "Expense recorded successfully"
}
```

**Error Response (`POST /api/expenses` with invalid amount):**
```json
{
  "success": false,
  "error": "Amount must be a positive number greater than 0"
}
```

---

## 🧪 Verification & Testing Checklist

- [x] **Database Initialization**: `expenses.db` table & indexes created smoothly on startup.
- [x] **Backend Validation**: Tested `POST` and `PUT` with empty titles, negative amounts, invalid categories, and bad dates. All return clean JSON 400 errors.
- [x] **Empty State**: Verified dashboard cards, empty notes on charts, and empty table state when 0 records exist.
- [x] **CRUD Operations**: Added, updated, viewed details, and deleted expenses.
- [x] **Indian Rupee Formatting**: Amounts display as `₹1,25,000.00`.
- [x] **Charts Integration**: Doughnut, bar, and area charts render dynamically without memory leaks.
- [x] **Theme Toggle**: Light mode and dark mode switch instantly with persistent `localStorage` preference.
- [x] **Advanced Table Controls**: Debounced search, date range pickers, category filter, column sorting, pagination, and CSV download work seamlessly.
- [x] **Keyboard Accessibility**: Modal close with `Esc`, shortcut popup with `?`, search focus with `/`.

---

## 💡 Future Improvement Suggestions

1. **Budget Limits & Alerts**: Set monthly budget caps per category with visual progress bars.
2. **Recurring Expenses**: Support scheduled recurring bills (e.g. monthly subscriptions).
3. **Receipt Attachment Upload**: Enable uploading receipt images stored locally or in SQLite blob fields.
4. **Multi-Currency Converter**: Support switching between INR (₹), USD ($), and EUR (€) with real-time conversion rates.
