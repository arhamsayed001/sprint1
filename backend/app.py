"""
Ledger — Modern Expense Management Dashboard API
Python Flask REST API with SQLite database, strict input validation,
standardized API response structures, error handling, search, filtering,
sorting, pagination, extended insights, health check, and CSV export.
"""

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import sqlite3
import os
import csv
import io
from datetime import datetime, date, timedelta
from functools import wraps
import jwt  # type: ignore
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": ["Content-Type", "Authorization"]}}, supports_credentials=True)
app.config['SECRET_KEY'] = 'ledger-super-secret-key-replace-in-prod'

DB_PATH = os.path.join(os.path.dirname(__file__), "expenses.db")

CATEGORIES = [
    "Food", "Transport", "Shopping", "Bills",
    "Entertainment", "Health", "Education", "Other"
]

FREQUENCIES = ["Daily", "Weekly", "Monthly", "Yearly"]


def get_db_connection():
    """Create a database connection with Row factory enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables and create required indexes for high performance."""
    conn = get_db_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS recurring_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            frequency TEXT NOT NULL,
            next_date TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS incomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            source TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            category TEXT NOT NULL,
            limit_amount REAL NOT NULL,
            UNIQUE(user_id, category),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # Migrations for existing DB if upgrading from non-auth version
    try:
        conn.execute("SELECT user_id FROM expenses LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE expenses ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
        conn.execute("ALTER TABLE recurring_expenses ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
        # Ensure default demo user exists for user_id 1 with valid password 'demo123'
        demo_hash = generate_password_hash("demo123")
        conn.execute("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (1, 'demo@ledger.com', ?, ?)", (demo_hash, datetime.utcnow().isoformat()))
        conn.execute("UPDATE users SET password_hash = ?, email = 'demo@ledger.com' WHERE id = 1 AND (password_hash = 'none' OR email = 'default@ledger.local')", (demo_hash,))

    # Add indexes for fast filtering and sorting
    conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_userid ON expenses(user_id)")
    conn.commit()
    conn.close()


# Ensure DB is initialized before any request is processed
with app.app_context():
    init_db()


# Helper function for standardized API responses
def make_response(success=True, data=None, message=None, error=None, code=200, **extra):
    payload = {"success": success}
    if message is not None:
        payload["message"] = message
    if data is not None:
        payload["data"] = data
    if error is not None:
        payload["error"] = error
    for k, v in extra.items():
        payload[k] = v
    return jsonify(payload), code


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
        if not token:
            print("AUTH ERROR: Token is missing. Header was:", auth_header)
            return make_response(success=False, error="Token is missing", code=401)
            
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user_id = data['user_id']
        except Exception as e:
            print("AUTH ERROR: Token decode failed:", e)
            return make_response(success=False, error="Token is invalid or expired", code=401)
            
        return f(current_user_id, *args, **kwargs)
    return decorated


@app.errorhandler(400)
def bad_request_error(e):
    return make_response(success=False, error="Bad Request", code=400)


@app.errorhandler(404)
def not_found_error(e):
    return make_response(success=False, error="Endpoint not found", code=404)


@app.errorhandler(500)
def internal_server_error(e):
    return make_response(success=False, error="An unexpected server error occurred", code=500)


def validate_expense_data(data, is_update=False):
    """
    Validates input fields for creating or updating an expense.
    Returns (cleaned_data, error_message).
    """
    if not isinstance(data, dict):
        return None, "Invalid JSON payload format"

    title = data.get("title")
    amount = data.get("amount")
    category = data.get("category")
    expense_date = data.get("date")
    notes = data.get("notes", "")

    # Title validation
    if title is None or not str(title).strip():
        return None, "Expense title is required"
    title = str(title).strip()
    if len(title) > 120:
        return None, "Title must be 120 characters or less"

    # Amount validation
    if amount is None:
        return None, "Expense amount is required"
    try:
        amount = float(amount)
        if amount <= 0:
            return None, "Amount must be a positive number greater than 0"
        if amount > 1000000000:
            return None, "Amount exceeds maximum limit"
    except (TypeError, ValueError):
        return None, "Amount must be a valid numeric value"

    # Category validation
    if not category or category not in CATEGORIES:
        return None, f"Category must be one of: {', '.join(CATEGORIES)}"

    # Date validation (YYYY-MM-DD format)
    if not expense_date:
        expense_date = datetime.today().strftime("%Y-%m-%d")
    else:
        try:
            parsed_date = datetime.strptime(str(expense_date), "%Y-%m-%d")
            expense_date = parsed_date.strftime("%Y-%m-%d")
        except ValueError:
            return None, "Date must be in valid YYYY-MM-DD format"

    # Notes validation
    if notes is not None:
        notes = str(notes).strip()
        if len(notes) > 500:
            return None, "Notes must be 500 characters or less"
    else:
        notes = ""

    cleaned = {
        "title": title,
        "amount": round(amount, 2),
        "category": category,
        "date": expense_date,
        "notes": notes
    }
    return cleaned, None


def validate_recurring_data(data):
    """
    Validates input fields for creating a recurring expense.
    """
    cleaned, error = validate_expense_data(data)
    if error:
        return None, error

    frequency = data.get("frequency")
    if not frequency or frequency not in FREQUENCIES:
        return None, f"Frequency must be one of: {', '.join(FREQUENCIES)}"
    
    cleaned["frequency"] = frequency
    cleaned["next_date"] = cleaned["date"]  # start date becomes next_date
    return cleaned, None


def add_frequency(dt_date, freq):
    if freq == "Daily":
        return dt_date + timedelta(days=1)
    if freq == "Weekly":
        return dt_date + timedelta(days=7)
    if freq == "Monthly":
        month = dt_date.month - 1 + 1
        year = dt_date.year + month // 12
        month = month % 12 + 1
        day = min(dt_date.day, [31,
            29 if year%4==0 and (not year%100==0 or year%400==0) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
        return dt_date.replace(year=year, month=month, day=day)
    if freq == "Yearly":
        year = dt_date.year + 1
        day = min(dt_date.day, [31,
            29 if year%4==0 and (not year%100==0 or year%400==0) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][dt_date.month-1])
        return dt_date.replace(year=year, day=day)
    return dt_date


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint for monitoring system status."""
    try:
        conn = get_db_connection()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return make_response(
        success=True,
        data={
            "status": "online",
            "database": db_status,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "version": "3.0.0"
        }
    )

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True)
    if not data or not data.get("email") or not data.get("password"):
        return make_response(success=False, error="Email and password required", code=400)
        
    email = data["email"].strip().lower()
    password = data["password"]
    
    try:
        conn = get_db_connection()
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            conn.close()
            return make_response(success=False, error="Email already registered", code=400)
            
        pwd_hash = generate_password_hash(password)
        conn.execute(
            "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
            (email, pwd_hash, datetime.utcnow().isoformat())
        )
        conn.commit()
        conn.close()
        
        return make_response(success=True, message="User registered successfully", code=201)
    except sqlite3.Error:
        return make_response(success=False, error="Database error", code=500)

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not data or not data.get("email") or not data.get("password"):
        return make_response(success=False, error="Email and password required", code=400)
        
    email = data["email"].strip().lower()
    password = data["password"]
    
    try:
        conn = get_db_connection()
        user = conn.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()
        
        if not user or not check_password_hash(user["password_hash"], password):
            return make_response(success=False, error="Invalid email or password", code=401)
            
        token = jwt.encode({
            "user_id": user["id"],
            "exp": datetime.utcnow() + timedelta(days=7)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        
        return make_response(success=True, data={"token": token, "email": user["email"]}, message="Login successful")
    except Exception as e:
        return make_response(success=False, error="Login failed", code=500)

@app.route("/api/auth/me", methods=["GET"])
@token_required
def get_me(current_user_id):
    try:
        conn = get_db_connection()
        user = conn.execute("SELECT id, email, created_at FROM users WHERE id = ?", (current_user_id,)).fetchone()
        conn.close()
        if not user:
            return make_response(success=False, error="User not found", code=404)
        return make_response(success=True, data=dict(user))
    except sqlite3.Error:
        return make_response(success=False, error="Database error", code=500)


@app.route("/api/categories", methods=["GET"])
@token_required
def get_categories(current_user_id):
    """Return list of valid expense categories."""
    return make_response(success=True, data=CATEGORIES)


@app.route("/api/expenses", methods=["GET"])
@token_required
def get_expenses(current_user_id):
    """
    Return expense records with support for search, category filtering,
    date range filtering, sorting, and pagination.
    """
    category = request.args.get("category")
    start = request.args.get("start")
    end = request.args.get("end")
    search = request.args.get("search")
    sort_by = request.args.get("sort_by", "date")
    order = request.args.get("order", "desc").lower()

    # Pagination parameters
    try:
        page = int(request.args.get("page", 1))
        if page < 1:
            page = 1
    except ValueError:
        page = 1

    try:
        limit = int(request.args.get("limit", 20))
        if limit < 1:
            limit = 20
        elif limit > 500:
            limit = 500
    except ValueError:
        limit = 20

    query = "SELECT * FROM expenses WHERE user_id = ?"
    count_query = "SELECT COUNT(*) as total FROM expenses WHERE user_id = ?"
    params = [current_user_id]

    if category and category != "All":
        query += " AND category = ?"
        count_query += " AND category = ?"
        params.append(category)

    if start:
        query += " AND date >= ?"
        count_query += " AND date >= ?"
        params.append(start)

    if end:
        query += " AND date <= ?"
        count_query += " AND date <= ?"
        params.append(end)

    if search:
        search_pattern = f"%{search.strip()}%"
        query += " AND (title LIKE ? OR notes LIKE ?)"
        count_query += " AND (title LIKE ? OR notes LIKE ?)"
        params.extend([search_pattern, search_pattern])

    # Validate sort field to prevent SQL injection
    valid_sort_fields = {"date": "date", "amount": "amount", "title": "title", "category": "category"}
    sort_column = valid_sort_fields.get(sort_by, "date")
    sort_order = "ASC" if order == "asc" else "DESC"

    # Secondary sort by id for deterministic pagination
    query += f" ORDER BY {sort_column} {sort_order}, id {sort_order}"

    # Calculate pagination offset
    offset = (page - 1) * limit
    query += " LIMIT ? OFFSET ?"
    query_params = list(params) + [limit, offset]

    try:
        conn = get_db_connection()
        total_records = conn.execute(count_query, params).fetchone()["total"]
        rows = conn.execute(query, query_params).fetchall()
        conn.close()

        items = [dict(row) for row in rows]
        total_pages = (total_records + limit - 1) // limit if total_records > 0 else 1

        return make_response(
            success=True,
            data=items,
            pagination={
                "page": page,
                "limit": limit,
                "total_count": total_records,
                "total_pages": total_pages
            }
        )
    except sqlite3.Error as e:
        return make_response(success=False, error="Database query failed", code=500)


@app.route("/api/expenses/<int:expense_id>", methods=["GET"])
@token_required
def get_expense(current_user_id, expense_id):
    """Retrieve details of a single expense."""
    try:
        conn = get_db_connection()
        row = conn.execute("SELECT * FROM expenses WHERE id = ? AND user_id = ?", (expense_id, current_user_id)).fetchone()
        conn.close()

        if not row:
            return make_response(success=False, error="Expense not found", code=404)

        return make_response(success=True, data=dict(row))
    except sqlite3.Error:
        return make_response(success=False, error="Failed to fetch expense details", code=500)


@app.route("/api/expenses", methods=["POST"])
@token_required
def add_expense(current_user_id):
    """Create a new expense with strict input validation."""
    data = request.get_json(silent=True)
    cleaned, error = validate_expense_data(data)
    if error:
        return make_response(success=False, error=error, code=400)

    try:
        conn = get_db_connection()
        cur = conn.execute(
            "INSERT INTO expenses (user_id, title, amount, category, date, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (current_user_id, cleaned["title"], cleaned["amount"], cleaned["category"], cleaned["date"], cleaned["notes"]),
        )
        conn.commit()
        new_id = cur.lastrowid
        conn.close()

        cleaned["id"] = new_id
        return make_response(success=True, data=cleaned, message="Expense recorded successfully", code=201)
    except sqlite3.Error:
        return make_response(success=False, error="Failed to insert expense into database", code=500)


@app.route("/api/expenses/<int:expense_id>", methods=["PUT"])
@token_required
def update_expense(current_user_id, expense_id):
    """Update an existing expense with strict input validation."""
    data = request.get_json(silent=True)
    cleaned, error = validate_expense_data(data, is_update=True)
    if error:
        return make_response(success=False, error=error, code=400)

    try:
        conn = get_db_connection()
        existing = conn.execute("SELECT id FROM expenses WHERE id = ? AND user_id = ?", (expense_id, current_user_id)).fetchone()
        if not existing:
            conn.close()
            return make_response(success=False, error="Expense not found", code=404)

        conn.execute(
            "UPDATE expenses SET title=?, amount=?, category=?, date=?, notes=? WHERE id=? AND user_id=?",
            (cleaned["title"], cleaned["amount"], cleaned["category"], cleaned["date"], cleaned["notes"], expense_id, current_user_id),
        )
        conn.commit()
        conn.close()

        cleaned["id"] = expense_id
        return make_response(success=True, data=cleaned, message="Expense updated successfully")
    except sqlite3.Error:
        return make_response(success=False, error="Failed to update expense in database", code=500)


@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
@token_required
def delete_expense(current_user_id, expense_id):
    """Delete an expense record by ID."""
    try:
        conn = get_db_connection()
        existing = conn.execute("SELECT id FROM expenses WHERE id = ? AND user_id = ?", (expense_id, current_user_id)).fetchone()
        if not existing:
            conn.close()
            return make_response(success=False, error="Expense not found", code=404)

        conn.execute("DELETE FROM expenses WHERE id = ? AND user_id = ?", (expense_id, current_user_id))
        conn.commit()
        conn.close()

        return make_response(success=True, message="Expense deleted successfully")
    except sqlite3.Error:
        return make_response(success=False, error="Failed to delete expense from database", code=500)


@app.route("/api/summary", methods=["GET"])
@token_required
def get_summary(current_user_id):
    """
    Provide aggregated statistics, category breakdown, monthly trends, weekly trends,
    and smart narrative insights for the dashboard.
    """
    try:
        conn = get_db_connection()

        # Overall Totals
        totals = conn.execute(
            "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total, COALESCE(MAX(amount), 0) as max_amount, COALESCE(AVG(amount), 0) as avg_amount FROM expenses WHERE user_id = ?",
            (current_user_id,)
        ).fetchone()

        income_totals = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as total_income FROM incomes WHERE user_id = ?",
            (current_user_id,)
        ).fetchone()
        total_income = income_totals["total_income"] if income_totals else 0.0
        balance = total_income - totals["total"]

        # Category Breakdown
        by_category = conn.execute(
            """SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
               FROM expenses WHERE user_id = ? GROUP BY category ORDER BY total DESC""",
            (current_user_id,)
        ).fetchall()

        # Budgets Utilization
        budgets_raw = conn.execute(
            "SELECT id, category, limit_amount FROM budgets WHERE user_id = ?",
            (current_user_id,)
        ).fetchall()
        
        # Map expenses by category for quick lookup
        spent_by_cat = {row["category"]: row["total"] for row in by_category}
        budgets = []
        for b in budgets_raw:
            spent = spent_by_cat.get(b["category"], 0.0)
            budgets.append({
                "id": b["id"],
                "category": b["category"],
                "limit_amount": b["limit_amount"],
                "spent_amount": spent,
                "utilization_pct": round((spent / b["limit_amount"]) * 100, 1) if b["limit_amount"] > 0 else 0
            })

        # Monthly Trends (last 12 months)
        by_month = conn.execute(
            """SELECT strftime('%Y-%m', date) as month, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
               FROM expenses WHERE user_id = ? GROUP BY month ORDER BY month ASC LIMIT 12""",
            (current_user_id,)
        ).fetchall()

        # Weekly Trends (last 8 weeks)
        by_week = conn.execute(
            """SELECT strftime('%Y-%W', date) as week, MIN(date) as week_start, COALESCE(SUM(amount), 0) as total
               FROM expenses WHERE user_id = ? GROUP BY week ORDER BY week ASC LIMIT 8""",
            (current_user_id,)
        ).fetchall()

        # Current vs Previous Month spending calculation
        now = datetime.today()
        current_month_str = now.strftime("%Y-%m")
        prev_month_date = (now.replace(day=1) - timedelta(days=1))
        prev_month_str = prev_month_date.strftime("%Y-%m")

        current_month_row = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?",
            (current_user_id, current_month_str)
        ).fetchone()
        current_month_spent = current_month_row["total"] if current_month_row else 0.0

        prev_month_row = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?",
            (current_user_id, prev_month_str)
        ).fetchone()
        prev_month_spent = prev_month_row["total"] if prev_month_row else 0.0

        # Percentage change
        if prev_month_spent > 0:
            month_change_pct = round(((current_month_spent - prev_month_spent) / prev_month_spent) * 100, 1)
        elif current_month_spent > 0:
            month_change_pct = 100.0
        else:
            month_change_pct = 0.0

        # Recent 5 expenses
        recent = conn.execute(
            "SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 5",
            (current_user_id,)
        ).fetchall()

        conn.close()

        # Generate Dynamic Smart Insights
        insights = []
        if totals["count"] > 0:
            # 1. Month comparison insight
            if prev_month_spent > 0:
                if month_change_pct > 0:
                    insights.append(f"You spent {abs(month_change_pct)}% more this month compared to last month.")
                elif month_change_pct < 0:
                    insights.append(f"Great job! Your spending is down {abs(month_change_pct)}% this month compared to last month.")
                else:
                    insights.append("Your spending this month is equal to last month's total.")

            # 2. Top category insight
            if by_category:
                top_cat = by_category[0]
                pct_share = round((top_cat["total"] / totals["total"]) * 100, 1) if totals["total"] > 0 else 0
                insights.append(f"{top_cat['category']} is your highest spending category ({pct_share}% of total spent).")

            # 3. Average transaction insight
            if totals["avg_amount"] > 0:
                insights.append(f"Your average expense transaction is ₹{totals['avg_amount']:,.2f}.")

        summary_data = {
            "totalIncome": round(total_income, 2),
            "balance": round(balance, 2),
            "totalSpent": round(totals["total"], 2),
            "totalCount": totals["count"],
            "avgExpense": round(totals["avg_amount"], 2),
            "maxExpense": round(totals["max_amount"], 2),
            "currentMonthSpent": round(current_month_spent, 2),
            "prevMonthSpent": round(prev_month_spent, 2),
            "monthChangePct": month_change_pct,
            "topCategory": by_category[0]["category"] if by_category else None,
            "byCategory": [dict(r) for r in by_category],
            "byMonth": [dict(r) for r in by_month],
            "byWeek": [dict(r) for r in by_week],
            "recent": [dict(r) for r in recent],
            "budgets": budgets,
            "insights": insights
        }

        return make_response(success=True, data=summary_data)
    except sqlite3.Error as e:
        return make_response(success=False, error="Failed to generate summary statistics", code=500)


@app.route("/api/expenses/export", methods=["GET"])
@token_required
def export_csv(current_user_id):
    """Export expense records as a downloadable CSV file."""
    category = request.args.get("category")
    start = request.args.get("start")
    end = request.args.get("end")
    search = request.args.get("search")

    query = "SELECT id, date, title, category, amount, notes FROM expenses WHERE user_id = ?"
    params = [current_user_id]

    if category and category != "All":
        query += " AND category = ?"
        params.append(category)
    if start:
        query += " AND date >= ?"
        params.append(start)
    if end:
        query += " AND date <= ?"
        params.append(end)
    if search:
        search_pattern = f"%{search.strip()}%"
        query += " AND (title LIKE ? OR notes LIKE ?)"
        params.extend([search_pattern, search_pattern])

    query += " ORDER BY date DESC, id DESC"

    try:
        conn = get_db_connection()
        rows = conn.execute(query, params).fetchall()
        conn.close()

        output = io.StringIO()
        writer = csv.writer(output)

        # Write header row
        writer.writerow(["ID", "Date", "Title", "Category", "Amount (INR)", "Notes"])

        # Write data rows
        for row in rows:
            writer.writerow([row["id"], row["date"], row["title"], row["category"], f"{row['amount']:.2f}", row["notes"]])

        csv_content = output.getvalue()
        output.close()

        filename = f"ledger_expenses_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return Response(
            csv_content,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except sqlite3.Error:
        return make_response(success=False, error="Failed to export CSV file", code=500)


@app.route("/api/recurring", methods=["GET"])
@token_required
def get_recurring_expenses(current_user_id):
    """List all recurring expense templates."""
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT * FROM recurring_expenses WHERE user_id = ? ORDER BY id DESC", (current_user_id,)).fetchall()
        conn.close()
        return make_response(success=True, data=[dict(r) for r in rows])
    except sqlite3.Error:
        return make_response(success=False, error="Database query failed", code=500)


@app.route("/api/recurring", methods=["POST"])
@token_required
def add_recurring_expense(current_user_id):
    """Create a new recurring expense template."""
    data = request.get_json(silent=True)
    cleaned, error = validate_recurring_data(data)
    if error:
        return make_response(success=False, error=error, code=400)

    try:
        conn = get_db_connection()
        cur = conn.execute(
            "INSERT INTO recurring_expenses (user_id, title, amount, category, frequency, next_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (current_user_id, cleaned["title"], cleaned["amount"], cleaned["category"], cleaned["frequency"], cleaned["next_date"], cleaned["notes"]),
        )
        conn.commit()
        new_id = cur.lastrowid
        conn.close()

        cleaned["id"] = new_id
        return make_response(success=True, data=cleaned, message="Recurring expense created successfully", code=201)
    except sqlite3.Error:
        return make_response(success=False, error="Failed to insert into database", code=500)


@app.route("/api/recurring/<int:recurring_id>", methods=["DELETE"])
@token_required
def delete_recurring_expense(current_user_id, recurring_id):
    """Delete a recurring expense."""
    try:
        conn = get_db_connection()
        existing = conn.execute("SELECT id FROM recurring_expenses WHERE id = ? AND user_id = ?", (recurring_id, current_user_id)).fetchone()
        if not existing:
            conn.close()
            return make_response(success=False, error="Recurring expense not found", code=404)

        conn.execute("DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?", (recurring_id, current_user_id))
        conn.commit()
        conn.close()
        return make_response(success=True, message="Recurring expense deleted successfully")
    except sqlite3.Error:
        return make_response(success=False, error="Failed to delete from database", code=500)


@app.route("/api/recurring/process", methods=["POST"])
@token_required
def process_recurring_expenses(current_user_id):
    """Check for due recurring expenses, insert them, and update their next_date."""
    try:
        conn = get_db_connection()
        today_str = datetime.today().strftime("%Y-%m-%d")
        
        due_expenses = conn.execute(
            "SELECT * FROM recurring_expenses WHERE user_id = ? AND next_date <= ?", 
            (current_user_id, today_str)
        ).fetchall()
        
        processed_count = 0
        for req in due_expenses:
            current_date_str = req["next_date"]
            current_date = datetime.strptime(current_date_str, "%Y-%m-%d").date()
            today_date = datetime.strptime(today_str, "%Y-%m-%d").date()
            
            while current_date <= today_date:
                conn.execute(
                    "INSERT INTO expenses (user_id, title, amount, category, date, notes) VALUES (?, ?, ?, ?, ?, ?)",
                    (current_user_id, req["title"], req["amount"], req["category"], current_date.strftime("%Y-%m-%d"), req["notes"])
                )
                processed_count += 1
                current_date = add_frequency(current_date, req["frequency"])
                
            conn.execute(
                "UPDATE recurring_expenses SET next_date = ? WHERE id = ? AND user_id = ?",
                (current_date.strftime("%Y-%m-%d"), req["id"], current_user_id)
            )
            
        conn.commit()
        conn.close()
        
        return make_response(success=True, message=f"Processed {processed_count} recurring expenses.")
    except sqlite3.Error as e:
        return make_response(success=False, error=str(e), code=500)


def validate_income_data(data):
    if not isinstance(data, dict): return None, "Invalid format"
    source = data.get("source")
    amount = data.get("amount")
    inc_date = data.get("date")
    notes = data.get("notes", "")

    if not source or not str(source).strip(): return None, "Source is required"
    if amount is None: return None, "Amount is required"
    try:
        amount = float(amount)
        if amount <= 0: return None, "Amount must be > 0"
    except: return None, "Invalid amount"
    
    if not inc_date: inc_date = datetime.today().strftime("%Y-%m-%d")
    return {"source": str(source).strip(), "amount": round(amount, 2), "date": inc_date, "notes": str(notes).strip()[:500]}, None

@app.route("/api/incomes", methods=["GET"])
@token_required
def get_incomes(current_user_id):
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT * FROM incomes WHERE user_id = ? ORDER BY date DESC, id DESC", (current_user_id,)).fetchall()
        conn.close()
        return make_response(success=True, data=[dict(r) for r in rows])
    except sqlite3.Error:
        return make_response(success=False, error="DB error", code=500)

@app.route("/api/incomes", methods=["POST"])
@token_required
def add_income(current_user_id):
    data = request.get_json(silent=True)
    cleaned, err = validate_income_data(data)
    if err: return make_response(success=False, error=err, code=400)
    try:
        conn = get_db_connection()
        cur = conn.execute("INSERT INTO incomes (user_id, source, amount, date, notes) VALUES (?, ?, ?, ?, ?)",
            (current_user_id, cleaned["source"], cleaned["amount"], cleaned["date"], cleaned["notes"]))
        conn.commit()
        cleaned["id"] = cur.lastrowid
        conn.close()
        return make_response(success=True, data=cleaned, message="Income added", code=201)
    except sqlite3.Error:
        return make_response(success=False, error="DB error", code=500)

@app.route("/api/incomes/<int:inc_id>", methods=["DELETE"])
@token_required
def delete_income(current_user_id, inc_id):
    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM incomes WHERE id = ? AND user_id = ?", (inc_id, current_user_id))
        conn.commit()
        conn.close()
        return make_response(success=True, message="Income deleted")
    except sqlite3.Error:
        return make_response(success=False, error="DB error", code=500)


def validate_budget_data(data):
    if not isinstance(data, dict): return None, "Invalid format"
    category = data.get("category")
    limit = data.get("limit_amount")

    if not category or category not in CATEGORIES: return None, "Valid category is required"
    if limit is None: return None, "Limit amount is required"
    try:
        limit = float(limit)
        if limit <= 0: return None, "Limit must be > 0"
    except: return None, "Invalid amount"
    
    return {"category": category, "limit_amount": round(limit, 2)}, None

@app.route("/api/budgets", methods=["GET"])
@token_required
def get_budgets(current_user_id):
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT * FROM budgets WHERE user_id = ?", (current_user_id,)).fetchall()
        conn.close()
        return make_response(success=True, data=[dict(r) for r in rows])
    except sqlite3.Error:
        return make_response(success=False, error="DB error", code=500)

@app.route("/api/budgets", methods=["POST"])
@token_required
def add_budget(current_user_id):
    data = request.get_json(silent=True)
    cleaned, err = validate_budget_data(data)
    if err: return make_response(success=False, error=err, code=400)
    try:
        conn = get_db_connection()
        # Ensure category isn't already budgeted for this user
        existing = conn.execute("SELECT id FROM budgets WHERE user_id = ? AND category = ?", (current_user_id, cleaned["category"])).fetchone()
        if existing:
            conn.execute("UPDATE budgets SET limit_amount = ? WHERE id = ?", (cleaned["limit_amount"], existing["id"]))
            conn.commit()
            cleaned["id"] = existing["id"]
        else:
            cur = conn.execute("INSERT INTO budgets (user_id, category, limit_amount) VALUES (?, ?, ?)",
                (current_user_id, cleaned["category"], cleaned["limit_amount"]))
            conn.commit()
            cleaned["id"] = cur.lastrowid
        conn.close()
        return make_response(success=True, data=cleaned, message="Budget saved", code=201)
    except sqlite3.Error:
        return make_response(success=False, error="DB error", code=500)

@app.route("/api/budgets/<int:bg_id>", methods=["DELETE"])
@token_required
def delete_budget(current_user_id, bg_id):
    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM budgets WHERE id = ? AND user_id = ?", (bg_id, current_user_id))
        conn.commit()
        conn.close()
        return make_response(success=True, message="Budget deleted")
    except sqlite3.Error:
        return make_response(success=False, error="DB error", code=500)


if __name__ == "__main__":
    init_db()
    print("==================================================")
    print(" Ledger Expense Management Dashboard Backend API")
    print(" Running at: http://127.0.0.1:5000")
    print(" Health check: http://127.0.0.1:5000/api/health")
    print("==================================================")
    app.run(debug=True, port=5000)
