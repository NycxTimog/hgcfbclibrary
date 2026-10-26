# HGCFBC Chords Library — Beta

A multi-page GitHub Pages front end for the Heaven's Gate Christian Faith Baptist Church worship-team chord library.

## Included
- `index.html` — welcome page
- `guitar-keyboard.html` — Guitar / Keyboard library
- `saxophone.html` — Saxophone library
- `upload.html` — drag/drop, file selection, destination selection, and confirmation
- `assets/styles.css` — responsive visual design
- `assets/app.js` — repository listing, upload, duplicate checks, delete confirmation, search, sorting, list/grid, open/download
- `assets/config.js` — repository settings

## 1. Configure the repository
Edit `assets/config.js` and replace:
- `YOUR_GITHUB_USERNAME`
- `YOUR_REPOSITORY_NAME`

Set `branch` to the default branch of your repository (usually `main`). Keep the folder paths as:
- `chords/guitar-keyboard`
- `chords/saxophone`

Create those two folders in the repository. Git does not track empty folders, so add a small `.gitkeep` file in each folder if there are no charts yet.

## 2. GitHub Pages
Upload the project files to the root of the repository (or copy them into your existing website repository). Enable GitHub Pages from the repository's Settings → Pages, using the branch and root folder where these files live.

## 3. Beta upload/delete behavior
The upload and delete features call the GitHub Contents API. For each upload or delete, the page asks the operator to paste a GitHub token. It is not stored in localStorage/sessionStorage or embedded in the source code. The token needs Contents read/write permission for this repository.

**Important beta limitation:** This is a client-side prototype. Anyone who can use upload/delete must have an appropriately permissioned token. Do not paste a broad or personal token into a public/shared device. For production, move write operations behind a small serverless backend or use a proper OAuth flow.

## 4. Public repository assumption
The library listing uses the unauthenticated GitHub API, so the repository must be public for the current beta version. If the repository is private, the listing needs an authenticated access strategy.

## 5. Duplicate detection
Before upload, the app checks whether the same filename already exists at the selected path. Existing files are not overwritten. If the check fails for a reason other than “not found,” the app stops and shows an error instead of uploading blindly.

## 6. Delete confirmation
Delete prompts for confirmation, requests the file's current SHA, then calls the GitHub API. A successful deletion is committed to the repository. The site may need a refresh or a short delay before deployment reflects it.

## 7. File limitations
- Accepted: PDF, JPG/JPEG, PNG
- Max: 10 MB per file
- Only files in the selected category folder are shown.
- Files are listed from GitHub, so devices share the same repository-backed list.

## 8. Test before inviting the team
1. Configure `assets/config.js`.
2. Create `chords/guitar-keyboard/` and `chords/saxophone/`.
3. Open the published site.
4. Upload a small test PDF to Guitar / Keyboard, then verify it exists in the repository and library.
5. Upload a different test file to Saxophone and verify it appears only on that page.
6. Try uploading the same filename into the same folder; it should stop and show a duplicate warning.
7. Delete a test file and verify the confirmation prompt appears before deletion.

## Troubleshooting
- `Repository is not configured`: edit `assets/config.js`.
- `Not Found`: check owner, repo, branch, and folder names.
- `Resource not accessible by personal access token`: token must have repository Contents read/write access.
- `Invalid request` / large file: check file size, token, and branch.
- Library does not show a newly uploaded file: refresh the page; GitHub Pages deployment can take a little time.
