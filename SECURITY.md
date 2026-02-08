# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

As Yolium Desktop is in early development, only the latest minor version receives security updates. Users should always update to the latest release.

## Reporting a Vulnerability

If you discover a security vulnerability in Yolium Desktop, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainers directly or use GitHub's private vulnerability reporting feature
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

## Response Timeline

- **Initial response**: Within 72 hours
- **Status update**: Within 7 days
- **Fix timeline**: Depends on severity (critical issues prioritized)

## Security Considerations

Yolium Desktop is an Electron application that manages Docker containers and terminal sessions. Key security areas include:

- **Container isolation**: Terminal sessions run inside Docker containers
- **IPC security**: Communication between renderer and main process is validated
- **No remote code execution**: The app does not fetch or execute remote code
- **Local-only operation**: No network services are exposed by default
- **Credential isolation**: API keys are passed as environment variables (never written to disk inside containers). OAuth credentials (`~/.claude`) are mounted read-only, copied to a writable staging area with restricted permissions (700/600), and cleaned up on container exit via an EXIT trap

## Scope

The following are in scope for security reports:

- Electron IPC vulnerabilities
- Container escape scenarios
- Privilege escalation
- Code injection vulnerabilities
- Insecure data storage
- Credential leakage (API keys, OAuth tokens, PATs)

The following are out of scope:

- Vulnerabilities in Docker itself (report to Docker)
- Social engineering attacks
- Physical access attacks
