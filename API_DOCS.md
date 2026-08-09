# NGA Central MIS API Documentation

This document provides a comprehensive overview of all API endpoints available in the NGA Central MIS system.

## Base URL

The API base URL depends on the environment:

- Development: `http://localhost:3000`
- Production: As configured in deployment

Most protected endpoints require authentication via JWT token. This can be provided in two ways:

1.  **Authorization Header**:
    ```
    Authorization: Bearer <your_jwt_token>
    ```

2.  **Centralized Auth Cookie (SSO)**:
    Include the `nga_auth_token` cookie in your request. This is handled automatically by browsers when `withCredentials` is enabled in your HTTP client.

    > [!IMPORTANT]
    > The Centralized Auth cookie is HTTP-only and cannot be read via JavaScript. Use the `/auth/session` endpoint to verify the current session.

## Response Format

All responses follow a consistent format:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "meta": { ... }
}
```

## Error Responses

Error responses include:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Error details"
}
```

---

## Health Check Endpoints

### GET /health/

Basic health check endpoint.

**Authentication:** None required

**Response:**

```json
{
  "success": true,
  "message": "Health check successful",
  "data": {
    "status": "healthy",
    "timestamp": "2023-...",
    "uptime": 123.45,
    "memory": { ... },
    "version": "1.0.0"
  }
}
```

### GET /health/db

Database connection health check.

**Authentication:** None required

**Response:**

```json
{
  "success": true,
  "message": "Database connection healthy",
  "data": {
    "status": "healthy",
    "database": "connected",
    "timestamp": "2023-..."
  }
}
```

---

## Authentication Endpoints

### POST /auth/login

User login.

**Authentication:** None required

**Request Body:**

```json
{
  "username": "username or email",
  "password": "password"
}
```

### POST /auth/verify-otp

Verify OTP for login. Upon success, this endpoint sets a `nga_auth_token` cookie on the root domain for SSO.

**Authentication:** Required (temporary token from login)

**Request Body:**

```json
{
  "otp": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "...",
    "user": { ... },
    "profile": { ... },
    "permissions": [...],
    "assignedPrograms": [...],
    "roles": [...],
    "forcePasswordChange": false,
    "academicYears": [...],
    "currentAcademicYear": { ... },
    "currentAcademicTerms": [...],
    "allPrograms": [...],
    "allGrades": [...],
    "systems": [...]
  }
}
```

> [!WARNING]
> Unlike `GET /users/me`, this response does **not** include `assignedGrades` (the class-teacher's assigned grades). Only `allGrades` (the full grade catalog) is returned here. Clients that need `assignedGrades` right after login (e.g. to scope a class-teacher's dashboard) must follow up with `GET /users/me` using the returned `token` — do not assume it is present on the login/verify-otp payload.

### GET /auth/session

Retrieve the current session and user profile. This is the primary endpoint for integrated systems to check if a user is already logged in via SSO.

**Authentication:** Required (via `nga_auth_token` cookie or Bearer token)

**Response:**

```json
{
  "success": true,
  "message": "Session retrieved",
  "data": {
    "user": { ... },
    "profile": { ... },
    "permissions": [...],
    "roles": [...],
    "systems": [...]
  }
}
```

### POST /auth/logout

Log out the current user and clear the SSO cookie `nga_auth_token`.

**Authentication:** Required

### POST /auth/forgot-password

Request password reset.

**Authentication:** None required

---

## 🌐 SSO (Single Sign-On) Endpoints

These endpoints are used for cross-domain authentication (OAuth2-style).

> [!TIP]
> **Integration Guide**: For a complete step-by-step tutorial on implementing SSO in your application (including backend code examples), please refer to the **[Client SSO Integration Guide](./SSO_CLIENT_INTEGRATION.md)**.

### GET /sso/authorize

Generate a short-lived authorization code for a logged-in user.

**Authentication:** Required (via `nga_auth_token` cookie or Bearer token)

**Query Parameters:**
- `client_id`: Registered client ID.
- `redirect_uri`: One of the pre-registered redirect URIs (exact match after trailing-slash normalization).
- `response_type` (optional): Only `"code"` is supported if provided.
- `state` (optional): Opaque value echoed back unchanged in the response, for CSRF protection.

**Response:**
```json
{
  "success": true,
  "data": {
    "code": "64_character_hex_string",
    "state": "whatever_you_sent_or_undefined"
  }
}
```

> [!NOTE]
> The authorization code expires in **5 minutes** and is single-use (`is_used` flag). Exchange it immediately after receiving it.

### POST /sso/token

Exchange an authorization code for a full JWT and user profile. This is a server-to-server call — never expose `client_secret` to the browser.

**Authentication:** None (requires `client_id` and `client_secret`)

**Request Body:**
```json
{
  "code": "AUTHORIZATION_CODE",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "JWT_TOKEN",
    "user": { ... },
    "permissions": [...]
  }
}
```

> [!WARNING]
> This response intentionally only contains `token`, `user`, and `permissions` — no `profile`, `roles`, `assignedPrograms`, `assignedGrades`, `academicYears`/`currentAcademicYear`/`currentAcademicTerms`, or `systems`. Client apps must call `GET /users/me` with the returned `token` immediately after the exchange to hydrate the full profile/roles/academic context (this is what `nga-task-mentor`'s `ssoCallback` already does — see [SSO_CLIENT_INTEGRATION.md](./SSO_CLIENT_INTEGRATION.md)).

---

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

### POST /auth/verify-reset-otp

Verify OTP for password reset.

**Authentication:** Required (temporary token from forgot-password)

**Request Body:**

```json
{
  "otp": "123456"
}
```

### POST /auth/reset-password

Reset password.

**Authentication:** Required (temporary token from verify-reset-otp)

**Request Body:**

```json
{
  "password": "newpassword",
  "confirmPassword": "newpassword"
}
```

### POST /auth/change-password

Change current user's password.

**Authentication:** Required

**Request Body:**

```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword",
  "confirmPassword": "newpassword"
}
```

---

## User Management Endpoints

### GET /users/me

Get current user profile.

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "user": {
      "user_id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "phone_number": "123456789",
      "status": "ACTIVE",
      "preferred_theme": "light",
      "created_at": "...",
      "updated_at": "..."
    },
    "profile": {
      "profile_id": 1,
      "user_id": 1,
      "first_name": "Admin",
      "last_name": "User",
      "gender": "MALE",
      "date_of_birth": "...",
      "address": "...",
      "user_type": "ADMIN",
      "external_id": "..."
    },
    "roles": [...],
    "permissions": [...],
    "assignedPrograms": [...],
    "assignedGrades": [...],
    "forcePasswordChange": false,
    "academicYears": [...],
    "currentAcademicYear": { ... },
    "currentAcademicTerms": [...],
    "allPrograms": [...],
    "allGrades": [...],
    "systems": [...]
  }
}
```

### PUT /users/me/profile

Update current user profile.

**Authentication:** Required

**Request Body:**

```json
{
  "first_name": "John",
  "last_name": "Doe",
  "gender": "MALE",
  "date_of_birth": "1990-01-01",
  "address": "Address",
  "external_id": "external_id"
}
```

### PATCH /users/me/theme

Update current user preferred theme.

**Authentication:** Required

**Request Body:**

```json
{
  "theme": "dark"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Theme preference updated successfully"
}
```

### GET /users/

Get all users (paginated).

**Authentication:** Required (MANAGE_USERS permission)

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `search`: Search term

### GET /users/template

Download user import template (Excel).

**Authentication:** Required (MANAGE_USERS permission)

### GET /users/search

Search users for sharing purposes.

**Authentication:** Required

**Query Parameters:**

- `q`: Search query
- `roleId`: Filter by role

### GET /users/:id

Get user by ID.

**Authentication:** Required

### PUT /users/:id/profile

Update user profile.

**Authentication:** Required

**Request Body:**

```json
{
  "first_name": "John",
  "last_name": "Doe",
  "gender": "MALE",
  "date_of_birth": "1990-01-01",
  "address": "Address",
  "external_id": "external_id"
}
```

### POST /users/

Create new user.

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "username": "username",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone_number": "+1234567890",
  "gender": "MALE",
  "date_of_birth": "1990-01-01",
  "address": "Address",
  "roles": [1, 2]
}
```

### POST /users/bulk

Bulk create users from Excel file.

**Authentication:** Required (MANAGE_USERS permission)

**Content-Type:** multipart/form-data

**Form Data:**

- `file`: Excel file

### PUT /users/:id

Update user.

**Authentication:** Required (MANAGE_USERS permission)

### DELETE /users/:id

Delete user.

**Authentication:** Required (MANAGE_USERS permission)

### PUT /users/:id/enable

Enable user account.

**Authentication:** Required (MANAGE_USERS permission)

### PUT /users/:id/disable

Disable user account.

**Authentication:** Required (MANAGE_USERS permission)

### GET /users/:id/roles

Get user roles.

**Authentication:** Required (MANAGE_USERS permission)

### POST /users/:id/roles

Assign role to user.

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "role_id": 1
}
```

### DELETE /users/:id/roles/:roleId

Remove role from user.

**Authentication:** Required (MANAGE_USERS permission)

### GET /users/:id/programs

Get programs associated with a user.

**Authentication:** Required

### GET /users/programs/:programId/roles

Get roles for users in a program.

**Authentication:** Required (VIEW_PROGRAM_USERS permission)

### GET /users/programs/:programId/roles/:roleId/users

Get users by program and role.

**Authentication:** Required (VIEW_PROGRAM_USERS permission)

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `search`: Search term

### GET /users/programs/:programId/users

Get all users in a program.

**Authentication:** Required (VIEW_PROGRAM_USERS permission)

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `search`: Search term

### GET /users/:id/grades

Get grades assigned to a user.

**Authentication:** Required

### POST /users/:id/grades

Assign grade to class teacher.

**Authentication:** Required (ASSIGN_GRADE_TO_CLASS_TEACHER permission)

**Request Body:**

```json
{
  "grade_id": 1
}
```

### DELETE /users/:id/grades/:gradeId

Remove grade from class teacher.

**Authentication:** Required (ASSIGN_GRADE_TO_CLASS_TEACHER permission)

### GET /users/grades/:gradeId/users

Get users by grade.

**Authentication:** Required (VIEW_USERS_BY_CLASS_TEACHER_GRADE permission)

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `search`: Search term

### GET /users/grades/:gradeId/subjects

Get subjects by grade.

**Authentication:** Required (VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE permission)

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `search`: Search term

---

## Permission Management Endpoints

### GET /permissions/roles

Get all roles.

**Authentication:** Required (MANAGE_ROLES permission)

### GET /permissions/roles/:id

Get role by ID.

**Authentication:** Required (MANAGE_ROLES permission)

### POST /permissions/roles

Create new role.

**Authentication:** Required (MANAGE_ROLES permission)

**Request Body:**

```json
{
  "name": "Role Name",
  "description": "Role description"
}
```

### PUT /permissions/roles/:id

Update role.

**Authentication:** Required (MANAGE_ROLES permission)

### PUT /permissions/roles/:id/disable

Disable role.

**Authentication:** Required (MANAGE_ROLES permission)

### PUT /permissions/roles/:id/enable

Enable role.

**Authentication:** Required (MANAGE_ROLES permission)

### GET /permissions/permissions

Get all permissions.

**Authentication:** Required (MANAGE_PERMISSIONS permission)

### GET /permissions/permissions/:id

Get permission by ID.

**Authentication:** Required (MANAGE_PERMISSIONS permission)

### POST /permissions/permissions

Create new permission.

**Authentication:** Required (MANAGE_PERMISSIONS permission)

**Request Body:**

```json
{
  "name": "permission_name",
  "description": "Permission description"
}
```

### PUT /permissions/permissions/:id

Update permission.

**Authentication:** Required (MANAGE_PERMISSIONS permission)

### PUT /permissions/permissions/:id/disable

Disable permission.

**Authentication:** Required (MANAGE_PERMISSIONS permission)

### PUT /permissions/permissions/:id/enable

Enable permission.

**Authentication:** Required (MANAGE_PERMISSIONS permission)

### GET /permissions/roles/:roleId/permissions

Get permissions for a role.

**Authentication:** Required (MANAGE_ROLES permission)

### POST /permissions/roles/:roleId/permissions

Assign permissions to role.

**Authentication:** Required (MANAGE_ROLES permission)

**Request Body:**

```json
{
  "permissionIds": [1, 2, 3]
}
```

### GET /permissions/users/:userId/roles

Get user roles.

**Authentication:** Required (MANAGE_USERS permission)

### POST /permissions/users/:userId/roles

Assign role to user.

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "roleId": 1
}
```

### DELETE /permissions/users/:userId/roles/:roleId

Remove role from user.

**Authentication:** Required (MANAGE_USERS permission)

---

## Document Management Endpoints

### GET /documents/roles

Get all roles for sharing.

**Authentication:** Required

### GET /documents/roles/:roleId/users

Get users by role for sharing.

**Authentication:** Required

### POST /documents/folders

Create new folder.

**Authentication:** Required

**Request Body:**

```json
{
  "name": "Folder Name",
  "parentFolderId": 1
}
```

### GET /documents/folders

Get folders (with optional parentFolderId).

**Authentication:** Required

**Query Parameters:**

- `parentFolderId`: Parent folder ID

### GET /documents/folders/tree

Get folder tree structure.

**Authentication:** Required

### GET /documents/folders/:folderId

Get folder details.

**Authentication:** Required

### PUT /documents/folders/:folderId

Update folder.

**Authentication:** Required

**Request Body:**

```json
{
  "name": "New Folder Name"
}
```

### DELETE /documents/folders/:folderId

Delete folder.

**Authentication:** Required

### GET /documents/folders/:folderId/permissions

Get folder permissions.

**Authentication:** Required

### POST /documents/folders/:folderId/share

Share folder with users/roles.

**Authentication:** Required

**Request Body:**

```json
{
  "userIds": [1, 2],
  "roleIds": [1],
  "permissions": ["read", "write"]
}
```

### DELETE /documents/folders/permissions/:permissionId

Revoke folder access.

**Authentication:** Required

### GET /documents/shared/folders

Get folders shared with current user.

**Authentication:** Required

### POST /documents/upload

Upload new document.

**Authentication:** Required

**Content-Type:** multipart/form-data

**Form Data:**

- `file`: File to upload
- `folderId`: Target folder ID
- `description`: Document description

### GET /documents/

Get documents (with optional filters).

**Authentication:** Required

**Query Parameters:**

- `folderId`: Folder ID
- `search`: Search term
- `page`: Page number
- `limit`: Items per page

### GET /documents/folder/:folderId
Get documents in specific folder.

---

## Academic Management Endpoints

### GET /academics/years
Get all academic years.
**Authentication:** Required (MANAGE_ACADEMICS)

### POST /academics/years
Create academic year.
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "name": "2023-2024",
  "start_date": "2023-09-01",
  "end_date": "2024-06-30",
  "is_current": true
}
```

### PUT /academics/years/:id
Update academic year.
**Authentication:** Required (MANAGE_ACADEMICS)

### DELETE /academics/years/:id
Delete academic year.
**Authentication:** Required (MANAGE_ACADEMICS)

### GET /academics/terms
Get all academic terms.
**Authentication:** Required

### POST /academics/terms
Create academic term.
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "name": "Term 1",
  "academic_year_id": 1,
  "start_date": "2023-09-01",
  "end_date": "2023-12-15"
}
```

### PUT /academics/terms/:id
Update academic term.
**Authentication:** Required (MANAGE_ACADEMICS)

### DELETE /academics/terms/:id
Delete academic term.
**Authentication:** Required (MANAGE_ACADEMICS)

### GET /academics/programs
Get all programs (e.g. Nursery, Primary).
**Authentication:** Required (MANAGE_ACADEMICS)

### POST /academics/programs
Create program.
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "name": "Primary Section",
  "description": "Primary Level Education"
}
```

### PUT /academics/programs/:id
Update program.
**Authentication:** Required (MANAGE_ACADEMICS)

### DELETE /academics/programs/:id
Delete program.
**Authentication:** Required (MANAGE_ACADEMICS)

### GET /academics/grades
Get all grades (e.g. P1, P2).
**Authentication:** Required (MANAGE_ACADEMICS or VIEW_PROGRAM_ACADEMICS)

### POST /academics/grades
Create grade.
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "name": "Primary 1",
  "program_id": 1,
  "level_order": 1
}
```

### PUT /academics/grades/:id
Update grade.
**Authentication:** Required (MANAGE_ACADEMICS)

### DELETE /academics/grades/:id
Delete grade.
**Authentication:** Required (MANAGE_ACADEMICS)

### GET /academics/subjects
Get all subjects.
**Authentication:** Required

### POST /academics/subjects
Create subject.
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "name": "Mathematics",
  "code": "MATH",
  "course_category_id": 1
}
```

### PUT /academics/subjects/:id
Update subject.
**Authentication:** Required (MANAGE_ACADEMICS)

### DELETE /academics/subjects/:id
Delete subject.
**Authentication:** Required (MANAGE_ACADEMICS)

### GET /academics/grades/:grade_id/subjects
Get subjects assigned to a grade.
**Authentication:** Required

### POST /academics/grades/assign-subject
Assign subject to a grade.
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "grade_id": 1,
  "subject_id": 2,
  "max_marks": 100
}
```

### DELETE /academics/grades/:grade_id/subjects/:subject_id
Remove subject from grade.
**Authentication:** Required (MANAGE_ACADEMICS)

### GET /academics/teachers/:teacherId/subjects
Get subjects assigned to a teacher.
**Authentication:** Required

### POST /academics/teachers/assign-subject
Assign teacher to a subject for a class group, scoped to an **academic year** (not term — see note below).
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "user_id": 10,
  "subject_id": 2,
  "class_group_id": 5,
  "academic_year_id": 3
}
```
> [!IMPORTANT]
> `academic_year_id` is optional and defaults to the current academic year if omitted. This field was renamed from `academic_term_id` — teacher-subject assignments are now year-scoped, not term-scoped.

### GET /academics/my-assigned-subjects
Get subjects assigned to the currently logged-in teacher.
**Authentication:** Required (VIEW_MY_ASSIGNED_SUBJECTS)

### GET /academics/course-categories
Get course categories (e.g. Core, Elective).
**Authentication:** Required (MANAGE_ACADEMICS)

### POST /academics/course-categories
Create course category.
**Authentication:** Required (MANAGE_ACADEMICS)

### GET /academics/class-groups
Get class groups (e.g. P1 A, P1 B).
**Authentication:** Required

### POST /academics/class-groups
Create class group.
**Authentication:** Required (MANAGE_ACADEMICS)
**Request Body:**
```json
{
  "name": "Stream A",
  "grade_id": 1
}
```
> [!IMPORTANT]
> Class groups are a **permanent label per grade**, not year-scoped. There is no `academic_year_id`/`academicYearId` field — a class group created once (e.g. "P1 A") persists across academic years. There is no "copy class groups to a new year" action.

### POST /academics/students/enroll-subject
Enroll student in an elective subject, scoped to an **academic year**.
**Authentication:** Required (MANAGE_USERS)
**Request Body:**
```json
{
  "user_id": 10,
  "subject_id": 2,
  "academic_year_id": 3
}
```
`academic_year_id` is optional and defaults to the current academic year.

### POST /academics/students/assign-class-group
Assign student to a class group (Stream), scoped to an **academic year** (a student's class group can change year to year even though the class group label itself is permanent).
**Authentication:** Required (MANAGE_USERS)
**Request Body:**
```json
{
  "user_id": 10,
  "class_group_id": 5,
  "academic_year_id": 3
}
```
`academic_year_id` is optional and defaults to the current academic year.

### GET /users/grade-assignments
Get all class-teacher grade assignments (admin view across all users/years).
**Authentication:** Required

### POST /users/grade-assignments/copy
Copy class-teacher grade assignments from one academic year to another.
**Authentication:** Required (ASSIGN_GRADE_TO_CLASS_TEACHER)

Get documents in specific folder.

**Authentication:** Required

### GET /documents/:documentId

Get document details.

**Authentication:** Required

### PUT /documents/:documentId

Update document metadata.

**Authentication:** Required

**Request Body:**

```json
{
  "name": "New Name",
  "description": "New description"
}
```

### DELETE /documents/:documentId

Delete document.

**Authentication:** Required

### GET /documents/:documentId/download

Download document file.

**Authentication:** Required

### POST /documents/:documentId/versions

Upload new version of document.

**Authentication:** Required

**Content-Type:** multipart/form-data

**Form Data:**

- `file`: New version file

### GET /documents/:documentId/versions

Get document versions.

**Authentication:** Required

### GET /documents/:documentId/permissions

Get document permissions.

**Authentication:** Required

### POST /documents/:documentId/share

Share document with users/roles.

**Authentication:** Required

**Request Body:**

```json
{
  "userIds": [1, 2],
  "roleIds": [1],
  "permissions": ["read", "write"]
}
```

### GET /documents/shared/with-me

Get documents shared with current user.

**Authentication:** Required

### DELETE /documents/permissions/:permissionId

Revoke document access.

**Authentication:** Required

---

## Academic Management Endpoints

### Academic Years

#### GET /academics/years

Get all academic years.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### GET /academics/years/:id

Get academic year by ID.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/years

Create academic year.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "name": "2023-2024",
  "startDate": "2023-09-01",
  "endDate": "2024-06-30"
}
```

#### PUT /academics/years/:id

Update academic year.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### DELETE /academics/years/:id

Delete academic year.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Academic Terms

#### GET /academics/terms

Get all academic terms.

**Authentication:** Required

#### GET /academics/terms/:id

Get academic term by ID.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/terms

Create academic term.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "name": "Fall 2023",
  "academicYearId": 1,
  "startDate": "2023-09-01",
  "endDate": "2023-12-31"
}
```

#### PUT /academics/terms/:id

Update academic term.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### DELETE /academics/terms/:id

Delete academic term.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Programs

#### GET /academics/programs

Get all programs.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### GET /academics/programs/:id

Get program by ID.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/programs

Create program.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "name": "Computer Science",
  "code": "CS",
  "description": "Computer Science Program"
}
```

#### PUT /academics/programs/:id

Update program.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### DELETE /academics/programs/:id

Delete program.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### GET /academics/programs/:programId/users

Get users in a program.

**Authentication:** Required (VIEW_PROGRAM_USERS permission)

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `search`: Search term
- `status`: User status filter

#### POST /academics/programs/assign-lead

Assign user as program lead.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "user_id": 1,
  "program_id": 1
}
```

#### DELETE /academics/programs/:program_id/leads/:user_id

Remove user as program lead.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Grades

#### GET /academics/grades

Get all grades.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### GET /academics/grades/:id

Get grade by ID.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/grades

Create grade.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "name": "Grade 10",
  "programId": 1,
  "level": 10
}
```

#### PUT /academics/grades/:id

Update grade.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### DELETE /academics/grades/:id

Delete grade.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Subjects

#### GET /academics/subjects

Get all subjects.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### GET /academics/subjects/:id

Get subject by ID.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/subjects

Create subject.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "name": "Mathematics",
  "code": "MATH",
  "description": "Mathematics subject"
}
```

#### PUT /academics/subjects/:id

Update subject.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### DELETE /academics/subjects/:id

Delete subject.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Grade-Subject Assignments

#### GET /academics/grades/:grade_id/subjects

Get subjects for a grade.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/grades/assign-subject

Assign subject to grade.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "grade_id": 1,
  "subject_id": 1
}
```

#### DELETE /academics/grades/:grade_id/subjects/:subject_id

Remove subject from grade.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Teacher-Subject Assignments

#### GET /academics/teachers/:teacherId/subjects

Get subjects assigned to teacher.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### GET /academics/subjects/:subject_id/teachers

Get teachers assigned to subject.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/teachers/assign-subject

Assign teacher to subject for a class group. **Year-scoped** (see note).

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "user_id": 1,
  "subject_id": 1,
  "class_group_id": 1,
  "academic_year_id": 1
}
```

`academic_year_id` is optional; defaults to the current academic year.

#### POST /academics/teachers/copy-assignments

Copy all teacher-subject assignments from one academic year to another (bulk rollover at year start).

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### DELETE /academics/teachers/:user_id/subjects/:subject_id/class-groups/:class_group_id/years/:academic_year_id

Remove teacher from subject for a given year.

**Authentication:** Required (MANAGE_ACADEMICS permission)

> [!IMPORTANT]
> **Breaking change from earlier versions of this doc:** teacher-subject assignment, student-subject enrollment, and student class-group assignment used to be scoped by `academic_term_id` (with routes ending in `.../terms/:academic_term_id`). They are now scoped by `academic_year_id` (routes end in `.../years/:academic_year_id`). Class groups themselves (`ClassGroup`) are **no longer year-scoped at all** — a class group is a permanent label per grade (e.g. "P1 A" always refers to the same class group record, every year); only the *assignment* of teachers/students to that class group is year-scoped.

### Class Groups

#### GET /academics/class-groups

Get all class groups. Optional `?grade_id=` filter.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### GET /academics/class-groups/:id

Get class group by ID.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### POST /academics/class-groups

Create class group.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "name": "Class A",
  "grade_id": 1
}
```

There is no `academic_year_id`/`academicYearId` field — class groups are a permanent label per grade, not created per year. Creating a class group with a `(grade_id, name)` pair that already exists returns a validation error rather than a duplicate.

#### PUT /academics/class-groups/:id

Update class group.

**Authentication:** Required (MANAGE_ACADEMICS permission)

#### DELETE /academics/class-groups/:id

Delete class group.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Student Enrollment

#### GET /academics/my-assigned-subjects

Get subjects assigned to current teacher.

**Authentication:** Required (VIEW_MY_ASSIGNED_SUBJECTS permission)

#### GET /academics/subjects/:subject_id/years/:academic_year_id/students

Get students enrolled in subject for a given academic year.

**Authentication:** Required (VIEW_SUBJECT_ENROLLED_STUDENTS permission)

#### GET /academics/subjects/:subject_id/terms/:term_id/students

Get students enrolled in subject for a given term (resolves the term's academic year internally). This is the endpoint `nga-task-mentor` uses for term-scoped rosters (quizzes, assignments, question bank).

**Authentication:** Required (VIEW_SUBJECT_ENROLLED_STUDENTS permission)

#### GET /academics/students/:studentId/enrolled-subjects

Get subjects student is enrolled in.

**Authentication:** Required (MANAGE_USERS permission)

#### GET /academics/students/:studentId/available-subjects

Get available subjects for student.

**Authentication:** Required (MANAGE_USERS permission)

#### POST /academics/students/enroll-subject

Enroll student in subject. **Year-scoped.**

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "user_id": 1,
  "subject_id": 1,
  "academic_year_id": 1
}
```

`academic_year_id` is optional; defaults to the current academic year.

#### DELETE /academics/students/:user_id/subjects/:subject_id/years/:academic_year_id

Unenroll student from subject for a given year.

**Authentication:** Required (MANAGE_USERS permission)

#### GET /academics/students/promotion-preview

Preview an automatic whole-year promotion (which students move to which grade/class group) before running it.

**Authentication:** Required (ASSIGN_STUDENT_CLASS_GROUPS permission)

#### POST /academics/students/promote-year

Run a whole-year promotion of students to the next grade/class group.

**Authentication:** Required (ASSIGN_STUDENT_CLASS_GROUPS permission)

#### POST /academics/students/promote-class

Promote a specific set of students to a target class group.

**Authentication:** Required (ASSIGN_STUDENT_CLASS_GROUPS permission)

### Student Class Group Assignment

#### GET /academics/students/:studentId/class-group

Get student's class group.

**Authentication:** Required (MANAGE_USERS permission)

#### POST /academics/students/assign-class-group

Assign student to class group. **Year-scoped** — the class group itself is permanent, but which students are in it is tracked per academic year.

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "user_id": 1,
  "class_group_id": 1,
  "academic_year_id": 1
}
```

`academic_year_id` is optional; defaults to the current academic year.

#### DELETE /academics/students/:user_id/class-groups/:class_group_id/years/:academic_year_id

Remove student from class group for a given year.

**Authentication:** Required (MANAGE_USERS permission)

---

## Scheme of Work Endpoints

Base path: `/scheme-of-work`. All routes require authentication.

### POST /scheme-of-work/upload

Upload a DOCX/PDF/TXT curriculum-derived scheme document and extract entries.

**Content-Type:** multipart/form-data (`file`)

### POST /scheme-of-work/ai-generate/structure

Detect Learning Outcome sections in an uploaded curriculum document (no AI call) so the UI can confirm scope before generation.

**Content-Type:** multipart/form-data (`file`, max 15MB, `.docx`/`.pdf`/`.txt`)

### POST /scheme-of-work/ai-generate

AI-generate a full scheme of work from an uploaded curriculum document. Starts an async job.

**Content-Type:** multipart/form-data (`file`)

### GET /scheme-of-work/ai-generate/:jobId/status

Poll status/result of an AI generation job.

### GET /scheme-of-work/entries

Get scheme entries filtered by subject/class group/term.

**Query Parameters:** `subject_id`, `class_group_id`, `academic_term_id` (required — this is the endpoint `nga-task-mentor`'s question bank feature calls to scope AI question generation to the current term's curriculum coverage).

### POST /scheme-of-work/entries

Add a single scheme entry (appended at the end, using caller-supplied week/dates).

### POST /scheme-of-work/entries/insert

Insert a new entry at any position; auto-renumbers/reschedules the rest.

### POST /scheme-of-work/entries/ai-suggest

Generate a single entry's content from a custom AI prompt (for review — not auto-saved).

### POST /scheme-of-work/entries/suggest-criteria

AI-powered Performance Criteria matching for a scheme entry's free-text content (stateless, not auto-saved).

### PUT /scheme-of-work/entries/:id/criteria

Replace the full set of Performance Criteria linked to a scheme entry.

### POST /scheme-of-work/schemes/:schemeId/link-criteria

Bulk-resolve `criteria_numbers` proposed at AI-generation time into real links, once the subject's curriculum has been confirmed/saved.

### POST /scheme-of-work/schemes/:schemeId/bulk-suggest-criteria

On-demand bulk AI criteria matching for an existing scheme (predates auto-tagging, or entries not covered by it).

### PATCH /scheme-of-work/entries/:id

Update a single scheme entry.

### DELETE /scheme-of-work/entries/:id

Delete a single scheme entry.

### GET /scheme-of-work/all-teachers

Admin: get all teachers with their scheme-of-work completion status.

**Authentication:** Required (VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST permission)

### POST /scheme-of-work/validate

Admin: validate a scheme of work.

**Authentication:** Required (VALIDATE_SCHEME_OF_WORK permission)

---

## Dashboard Endpoints

### GET /dashboard/stats

Get comprehensive dashboard statistics.

**Authentication:** Required

### GET /dashboard/basic-stats

Get basic dashboard statistics.

**Authentication:** Required

### GET /dashboard/teacher-stats

Get teacher-specific dashboard statistics.

**Authentication:** Required

---

## Common HTTP Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `422`: Unprocessable Entity
- `500`: Internal Server Error

## Rate Limiting

The API implements rate limiting to prevent abuse. Rate limits vary by endpoint and user role.

## File Upload Limits

- Documents: 50MB per file
- User bulk import: 5MB per file

## Pagination

List endpoints support pagination with the following query parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Pagination metadata is included in the response:

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

## System Management Endpoints (SSO Clients)

### GET /systems/
Get all registered systems.
**Authentication:** Required (MANAGE_SYSTEMS)

### POST /systems/
Register new system (SSO Client).
**Authentication:** Required (MANAGE_SYSTEMS)
**Request Body:**
```json
{
  "name": "My App",
  "client_id": "my_app_id",
  "allowed_redirect_uris": "https://myapp.com/callback",
  "description": "My external application"
}
```

### GET /systems/:id
Get system details.
**Authentication:** Required (MANAGE_SYSTEMS)

### PUT /systems/:id
Update system.
**Authentication:** Required (MANAGE_SYSTEMS)

### DELETE /systems/:id
Delete system.
**Authentication:** Required (MANAGE_SYSTEMS)

### POST /systems/assign/school
Assign system to a school.
**Authentication:** Required (ASSIGN_SCHOOL_SYSTEMS)
**Request Body:**
```json
{
  "system_id": 1,
  "school_id": 1
}
```

### POST /systems/assign/role
Assign system access to a role within a school.
**Authentication:** Required (ASSIGN_SCHOOL_SYSTEMS)
**Request Body:**
```json
{
  "system_id": 1,
  "school_id": 1,
  "role_id": 2
}
```

---

## School Management Endpoints

### GET /schools/
Get all schools.
**Authentication:** Required (MANAGE_SCHOOLS)

### POST /schools/
Create new school.
**Authentication:** Required (MANAGE_SCHOOLS)
**Request Body:**
```json
{
  "name": "Kigali International School",
  "address": "Kigali, Rwanda",
  "contact_email": "info@kis.rw"
}
```

### GET /schools/:id
Get school details.
**Authentication:** Required (MANAGE_SCHOOLS)

### PUT /schools/:id
Update school.
**Authentication:** Required (MANAGE_SCHOOLS)

### DELETE /schools/:id
Delete school.
**Authentication:** Required (MANAGE_SCHOOLS)

---

## Parenting Endpoints

### GET /parenting/student/:studentId/parents
Get parents of a student.
**Authentication:** Required

### GET /parenting/parent/:parentId/students
Get students (children) of a parent.
**Authentication:** Required

### POST /parenting/assign
Assign a parent to a student.
**Authentication:** Required
**Request Body:**
```json
{
  "student_id": 1,
  "parent_id": 2
}
```

### POST /parenting/remove
Remove a parent-student relationship.
**Authentication:** Required
**Request Body:**
```json
{
  "student_id": 1,
  "parent_id": 2
}
```

### GET /parenting/search
Search for potential relations.
**Authentication:** Required
