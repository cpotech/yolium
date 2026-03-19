# Setup network restrictions (HTTPS, DNS only)
# Requires NET_ADMIN capability. Gracefully skips if unavailable.
setup_network_restrictions() {
    # Skip if user opts out
    if [ "${YOLIUM_NETWORK_FULL:-}" = "true" ]; then
        add_status "⚠️  Network restrictions disabled (YOLIUM_NETWORK_FULL=true)"
        return 0
    fi

    # Check if iptables is available
    if ! command -v iptables >/dev/null 2>&1; then
        add_status "⚠️  iptables not available, network restrictions not applied"
        return 0
    fi

    # Try to apply rules (will fail silently without NET_ADMIN)
    if ! sudo iptables -L OUTPUT -n >/dev/null 2>&1; then
        add_status "⚠️  NET_ADMIN capability not available, network restrictions not applied"
        return 0
    fi

    # Allow localhost (required for OpenCode internal server)
    sudo iptables -A OUTPUT -o lo -j ACCEPT

    # Allow established/related connections (responses to allowed requests)
    sudo iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # Allow DNS (UDP and TCP port 53)
    sudo iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
    sudo iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

    # Allow HTTPS (port 443) - APIs, package registries, HTTPS git
    sudo iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

    # Allow IMAPS (port 993) - Secure IMAP for email integration
    sudo iptables -A OUTPUT -p tcp --dport 993 -j ACCEPT

    # Allow SMTP submission (port 587) - Email sending via STARTTLS
    sudo iptables -A OUTPUT -p tcp --dport 587 -j ACCEPT

    # Drop everything else
    sudo iptables -A OUTPUT -j DROP

    add_status "🔒 Network restrictions applied (HTTPS/DNS/IMAPS/SMTP only)"
}

# Apply network restrictions if available
log "Setting up network restrictions..."
setup_network_restrictions
log "Network restrictions setup complete"
