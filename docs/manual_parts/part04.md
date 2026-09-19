### 4.7 Tasks & Milestones

Schedule and track key project events (foundation complete, slab cast, possession, etc.).

- **Columns** — Milestone (name + project · wing), Start, Target, Progress bar (green at 100%), Status badge, Responsible person.
- **Filters** — Project, Status (pending / in_progress / completed / delayed).
- **CRUD fields** — Project, Name, Start date, Target date, Progress % (**entering 100 auto-completes** the milestone — status flips to completed), Status, Responsible person (user directory), Completion date, Description, Remarks.
- Overdue milestones (past target, not completed) surface as **delayed** in the dashboard overview.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List/create/edit/delete | `GET|POST|PUT|DELETE /api/milestones…` | `milestones` (+ project, responsible user joins), `audit_logs` | Delay detection → `notifications` event `milestone_delayed` to users with `milestones.approve` |

![Milestones](assets/screenshots/web-05-milestones.png)

### 4.8 Drawings

Version-controlled drawing control with revision approval.

**List** — Drawing No., Title (+ project · wing), Category badge (architectural / structural / electrical / plumbing / hvac / fire_fighting / interior / other), current **Rev** badge, Approval status, Uploaded by. Filters: search, project, category.

**Upload Drawing** — Project, Wing (optional), Drawing number (required), Category, Title (required), First revision no (default `R0`), Revision date, File (PDF/image), Remarks. The file is stored in `file_uploads` and the first row of `drawing_revisions` is created.

**Drawing detail modal**

- Header: project, category, status, latest revision.
- **Revision History** table — Rev, Date, status, uploaded by, remarks, preview/download buttons.
- **Add revision** — revision no, date, remarks, file → new revision row with status `pending`.
- **Approve / Reject revision** (when `drawings.approve`) — on approval the drawing's `approval_status` becomes **approved** and the new file is the current one; on rejection it goes to `rejected`.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/drawings?page=&search=&projectId=&category=` | `drawings` (+ latest revision), `file_uploads` | — |
| Upload | `POST /api/drawings` (multipart) | `file_uploads`, `drawings`, `drawing_revisions` (R0), `audit_logs` | `notifications` event `drawing_revision` to drawing approvers |
| Detail | `GET /api/drawings/:id` | `drawings` + `drawing_revisions` + files | — |
| Add revision | `POST /api/drawings/:id/revisions` (multipart) | `file_uploads`, `drawing_revisions` (status pending), `audit_logs` | Notification to approvers |
| Approve/reject | `PUT /api/drawings/revisions/:revisionId/status` | `drawing_revisions`, **`drawings.approval_status` + latest revision updated** | `audit_logs`, notification |
| Preview / download | `GET /api/files/:id` | `file_uploads` | Authenticated object URL |

![Drawings](assets/screenshots/web-06-drawings.png)

### 4.9 Inspections

On-site inspection checklists (safety, pre-pour, finishing, etc.).

**List** — No. (INS-…), Type badge, Project (+ wing · location), Date, Inspector, GPS link, Status badge (pending / passed / failed / reinspection_required / closed). Filters: project, status. **Close** action for pending/failed/reinspection rows (requires `inspections.approve`).

**New Inspection modal**

1. Inspection type (from Masters → Inspection Types; the type carries a **checklist template** of items).
2. Project, Wing, Location, Date/time, Inspector (user directory).
3. **Checklist** — one row per item with result **pass / fail / N-A**; add or remove rows.
4. **Capture GPS** (browser geolocation) — stored with the inspection.
5. Save → status `pending`; the result status is derived (any fail → `failed`, else `passed`).

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/inspections?page=&projectId=&status=` | `inspections` (+ type, project, inspector) | — |
| Create | `POST /api/inspections` `{…form, items:[{checklist_item, result}]}` | `inspections`, `inspection_items` (one row per checklist line), `audit_logs` | Failed result → `notifications` event `inspection_failed`; type checklist loaded from `inspection_types.checklist_template` |
| Detail | `GET /api/inspections/:id` | `inspections` + `inspection_items` | — |
| Update / close | `PUT /api/inspections/:id` | `inspections`, `audit_logs` | — |

![Inspections](assets/screenshots/web-15-inspections.png)

### 4.10 Test Reports (quality)

Material laboratory test register with an approve/reject workflow.

**List** — Test No., Test (type), Project (+ wing), Material, Test date, Laboratory, **Result** (pending / pass / fail / inconclusive), status, **⬇ PDF** download when a file is attached. Filters: result, test type.

**New Test Report fields** — Project, Wing, Test type (from Masters → Test Types), Material (optional), Sample date, Test date, Laboratory, Standard/spec, Result (default pending), Test result / values (multi-line), Remarks, report file upload.

**Workflow** — when a report is in status `submitted`, approvers (`test_reports.approve`) get inline **Approve / Reject** buttons.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List/create/edit/delete | `GET|POST|PUT|DELETE /api/test-reports…` | `test_reports` (+ type, material joins), `file_uploads` when a PDF is attached, `audit_logs` | `result_status = fail` → `notifications` event `test_failed` to quality approvers |
| Approve/reject | `PUT /api/test-reports/:id/status` | `test_reports.status` (submitted → approved/rejected) + `approved_by/at` | `audit_logs`, notification |
| PDF download | `GET /api/files/:id` | `file_uploads` | Authenticated object URL |

![Test Reports](assets/screenshots/web-14-test-reports.png)

### 4.11 Documents

Project document vault with expiry tracking.

- **Categories** — agreement, certificate, approval, noc, project image, demo image, site photo, client document, government document, other.
- **List columns** — Title, Category, Document no, Version, Expiry (highlighted **amber when expiring within 30 days**), File name, Uploaded by. Filters: category, project, search.
- **Upload** — Project, Wing (optional), Title (required), Category, Document number, Version, Expiry date, Description, File (PDF / image / Office docs).
- **Actions** — ⬇ Download (authenticated file URL), Delete (with confirmation).
- Documents near expiry appear on the **Dashboard** ("Documents expiring soon") and raise the `document_expiry` notification event.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/documents?limit=&category=&projectId=&search=` | `project_documents` (+ files, uploader) | — |
| Upload | `POST /api/documents` (multipart) | `file_uploads`, `project_documents`, `audit_logs` | — |
| Download / delete | `GET /api/files/:id` · `DELETE /api/documents/:id` | `file_uploads` · `project_documents` | Audited |

![Documents](assets/screenshots/web-19-documents.png)

### 4.12 Issues / Snags

Field issues with priority, assignment, due dates, photos and a discussion thread.

**List** — No. (ISS-…), Issue (title + project · wing · location), Category, Priority badge (low / medium / high / critical), Status badge, Assigned to, Due (red when overdue and not resolved/closed). Filters: project, status, priority.

**Raise Issue modal** — Project, Wing, Title (required), Category (from Masters → Issue Categories), Priority, Assign to (user directory), Due date, Location, Description, optional photos (multipart).

**Issue detail modal**

- Full header: project/wing/location, priority + category, raised by (+ GPS link), due date, description, photos.
- **Status & assignment editor** (visible to `issues.edit` holders or the assignee): status select and assignee select → Save.
- **Discussion** — chronological comment thread with author + timestamp; add comments inline (Enter or Send).

**Status workflow:** `open → assigned → in_progress → resolved → closed`, with **reopen** from resolved/closed back to `in_progress`.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/issues?page=&projectId=&status=&priority=` | `issues` (+ category, assignee, project) | — |
| Raise | `POST /api/issues` (multipart) | `issues` (number auto `ISS-####`), `file_uploads`+issue photos when attached, `audit_logs` | `notifications` `issue_created` to watchers; `issue_assigned` to the assignee when set |
| Detail | `GET /api/issues/:id` | `issues` + comments + photos | — |
| Update status/assignee | `PUT /api/issues/:id` | `issues`, `audit_logs` | `notifications` `issue_updated` to affected users |
| Comment | `POST /api/issues/:id/comments` | `issue_comments`, `audit_logs` | — |
| Overdue sweep | server-side on reads | `issues` | `notifications` `issue_overdue` |

![Issues / Snags](assets/screenshots/web-16-issues.png)
