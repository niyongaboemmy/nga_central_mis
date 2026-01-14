# NGA Central MIS API Documentation

This document provides a comprehensive overview of all API endpoints available in the NGA Central MIS system.

## Base URL

The API base URL depends on the environment:

- Development: `http://localhost:3000`
- Production: As configured in deployment

## Authentication

Most endpoints require authentication via JWT token. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

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
  "email": "user@example.com",
  "password": "password"
}
```

### POST /auth/verify-otp

Verify OTP for login.

**Authentication:** Required (temporary token from login)

**Request Body:**

```json
{
  "otp": "123456"
}
```

### POST /auth/forgot-password

Request password reset.

**Authentication:** None required

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

### PUT /users/me/profile

Update current user profile.

**Authentication:** Required

**Request Body:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
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

### POST /users/

Create new user.

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "roleIds": [1, 2]
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
  "roleId": 1
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
  "gradeId": 1,
  "subjectId": 1
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

Assign teacher to subject.

**Authentication:** Required (MANAGE_ACADEMICS permission)

**Request Body:**

```json
{
  "userId": 1,
  "subjectId": 1,
  "classGroupId": 1,
  "academicTermId": 1
}
```

#### DELETE /academics/teachers/:user_id/subjects/:subject_id/class-groups/:class_group_id/terms/:academic_term_id

Remove teacher from subject.

**Authentication:** Required (MANAGE_ACADEMICS permission)

### Class Groups

#### GET /academics/class-groups

Get all class groups.

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
  "gradeId": 1,
  "academicYearId": 1
}
```

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

#### GET /academics/subjects/:subject_id/terms/:academic_term_id/students

Get students enrolled in subject.

**Authentication:** Required (VIEW_MY_ASSIGNED_SUBJECTS permission)

#### GET /academics/students/:studentId/enrolled-subjects

Get subjects student is enrolled in.

**Authentication:** Required (MANAGE_USERS permission)

#### GET /academics/students/:studentId/available-subjects

Get available subjects for student.

**Authentication:** Required (MANAGE_USERS permission)

#### POST /academics/students/enroll-subject

Enroll student in subject.

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "userId": 1,
  "subjectId": 1,
  "academicTermId": 1
}
```

#### DELETE /academics/students/:user_id/subjects/:subject_id/terms/:academic_term_id

Unenroll student from subject.

**Authentication:** Required (MANAGE_USERS permission)

### Student Class Group Assignment

#### GET /academics/students/:studentId/class-group

Get student's class group.

**Authentication:** Required (MANAGE_USERS permission)

#### POST /academics/students/assign-class-group

Assign student to class group.

**Authentication:** Required (MANAGE_USERS permission)

**Request Body:**

```json
{
  "userId": 1,
  "classGroupId": 1
}
```

#### DELETE /academics/students/:user_id/class-groups/:class_group_id

Remove student from class group.

**Authentication:** Required (MANAGE_USERS permission)

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
