Analyze the document **`Weekly Instructor Report Template.pdf`** located in the **`/docs`** directory.

Based on the analysis of this document, design and implement a **modern Reporting Module**.

---

### Module Objective

Develop a **reporting system** where users can easily record actions they performed on specific dates and administrators can analyze reports through different time-based summaries.

---

### Main Interface Structure

The module should contain **three main tabs**:

1. **Reporting**
2. **Submitted Reports**
3. **Dashboard**

---

### 1. Reporting Tab (Calendar-Based Interface)

Create a **modern calendar interface** where:

* Users can **click on a specific date**.
* A **modal or popup form** opens.
* The user fills in the report for actions performed on that date.
* Users can submit **multiple actions per day**.

The interface should be **clean, interactive, and intuitive**.

Calendar features:

* Month view calendar
* Highlight days with submitted reports
* Quick access to add/edit reports
* Popup form for action submission

---

### 2. Intelligent Form Autofill

After analyzing **`reporting_form_required_fields.doc`**, identify fields that **already exist in the system database**.

For example:

* **Scheme of Work**
* **Lesson Plans**
* Other system-generated information

These fields **must NOT be manually entered by the user**.

Instead:

* Fetch them automatically from the system
* Autofill them in the form
* Use dropdowns or read-only fields where appropriate

The form should only request **information that does not already exist in the system**.

---

### 3. Submitted Reports Tab

Provide a page where users and administrators can **view previously submitted reports**.

Include filtering options such as:

* Daily reports
* Weekly reports
* Monthly reports
* Annual reports
* Custom date range
* User filter

Display options may include:

* Table view
* Timeline view
* Calendar view

---

### 4. Dashboard Tab

Create an **interactive dashboard** that summarizes reporting activities.

Dashboard metrics may include:

* Total actions today
* Weekly activity summary
* Monthly activity summary
* Annual activity summary
* Most active users
* Activity trends

Include visualizations such as:

* Line charts
* Bar charts
* Pie charts

---

### Technical Requirements

Implement the module as a **full-stack feature** with a modern architecture.

Recommended stack:

**Frontend**

* React
* TypeScript
* TailwindCSS
* Calendar library (e.g., FullCalendar or React Big Calendar)
* Chart library (Chart.js or Recharts)

**Backend**

* REST API
* Proper database schema for reports
* Data fetching for auto-filled fields

---

### UX/UI Expectations

* Modern and responsive design
* Smooth popup interactions
* Calendar-based reporting experience
* Clean dashboards and analytics
* Minimal manual data entry through intelligent autofill

---

### Expected Deliverables

1. Analysis of the required fields from the document
2. Optimized reporting form
3. Calendar-based reporting interface
4. Reports filtering system
5. Interactive dashboard
6. Full-stack implementation