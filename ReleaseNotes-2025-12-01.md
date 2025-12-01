Key Features Added

1. Direct File Upload Interface

   - Replaced old URL-based input with a fully functional file upload component.
   - Added support for images, PDFs, and documents.
   - Preview before upload.
   - Server-side validation for file size and type.
   - Integrated upload handling into project creation/edit flows.

2. Rich Text Editor for Project Descriptions

   - Added Quill-based rich text editor.
   - Features: bold, italic, underline, headings, lists, links.
   - Content saved as clean HTML / delta format.
   - Displayed in project detail pages with proper formatting.
   - Fully responsive on mobile and desktops.

3. Proper Pagination in Listings

   - Implemented API-level pagination (page + limit).
   - Added pagination UI: page numbers, next/prev.
   - Integrated pagination with filters and search.
   - Improved performance on long lists.

4. Accessibility Enhancements (A11y)

   - Added ARIA labels and roles.
   - Improved keyboard navigation (tab index fixes).
   - Visible focus states.
   - Better color contrast adhering to WCAG guidelines.
   - Structural improvements with semantic HTML.

5. Consistent Layout System

   - Unified spacing, typography, and layout standards.
   - Introduced responsive grid/flex system.
   - Standardized reusable layout components.
   - Improved mobile and tablet responsiveness.
   - Minor dark/light mode alignment (optional support).

6. Testing

   - Manual testing done across desktop, tablet, and mobile.
   - Verified keyboard navigation.
   - Checked cross-browser compatibility.
   - Uploaded files of different sizes and formats for validation.

Related Issue

Closes #42
