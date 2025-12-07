#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}=== Grokicad Nginx Setup ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo ./setup-nginx.sh)${NC}"
    exit 1
fi

# Step 1: Create SSL directory
echo -e "\n${GREEN}[1/5] Creating SSL directory...${NC}"
mkdir -p /etc/nginx/ssl
chmod 700 /etc/nginx/ssl

# Step 2: Check for Cloudflare origin certificates
echo -e "\n${GREEN}[2/5] Checking for Cloudflare origin certificates...${NC}"
if [ ! -f /etc/nginx/ssl/cloudflare-origin.pem ] || [ ! -f /etc/nginx/ssl/cloudflare-origin.key ]; then
    echo -e "${YELLOW}Cloudflare origin certificates not found!${NC}"
    echo ""
    echo "To generate Cloudflare Origin Certificates:"
    echo "  1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
    echo "  2. Click 'Create Certificate'"
    echo "  3. Keep defaults (RSA 2048, 15 years validity)"
    echo "  4. Copy the certificate to: /etc/nginx/ssl/cloudflare-origin.pem"
    echo "  5. Copy the private key to: /etc/nginx/ssl/cloudflare-origin.key"
    echo ""
    echo -e "${CYAN}Quick setup (paste your certificates):${NC}"
    echo "  sudo nano /etc/nginx/ssl/cloudflare-origin.pem"
    echo "  sudo nano /etc/nginx/ssl/cloudflare-origin.key"
    echo "  sudo chmod 600 /etc/nginx/ssl/cloudflare-origin.*"
    echo ""
    
    read -p "Do you want to continue without certificates (for testing)? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborting. Please set up certificates first.${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Creating self-signed certificate for testing...${NC}"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/cloudflare-origin.key \
        -out /etc/nginx/ssl/cloudflare-origin.pem \
        -subj "/CN=grokicad.com" 2>/dev/null
    echo -e "${YELLOW}⚠ Using self-signed cert. Replace with Cloudflare Origin cert for production!${NC}"
fi

chmod 600 /etc/nginx/ssl/cloudflare-origin.*

# Step 3: Copy nginx configuration
echo -e "\n${GREEN}[3/5] Installing nginx configuration...${NC}"
cp "$SCRIPT_DIR/grokicad-api.conf" /etc/nginx/conf.d/grokicad-api.conf
echo "Installed to /etc/nginx/conf.d/grokicad-api.conf"

# Step 4: Update server_name if needed
echo -e "\n${GREEN}[4/5] Checking server configuration...${NC}"
CURRENT_DOMAIN=$(grep -m1 "server_name" /etc/nginx/conf.d/grokicad-api.conf | awk '{print $2}' | tr -d ';')
echo "Current domain: $CURRENT_DOMAIN"
read -p "Enter your domain (press Enter to keep '$CURRENT_DOMAIN'): " NEW_DOMAIN
if [ -n "$NEW_DOMAIN" ]; then
    sed -i "s/server_name .*/server_name $NEW_DOMAIN;/g" /etc/nginx/conf.d/grokicad-api.conf
    echo "Updated domain to: $NEW_DOMAIN"
fi

# Step 5: Test and reload nginx
echo -e "\n${GREEN}[5/5] Testing and reloading nginx...${NC}"
nginx -t
if [ $? -eq 0 ]; then
    systemctl reload nginx
    echo -e "${GREEN}✓ Nginx configuration reloaded successfully${NC}"
else
    echo -e "${RED}✗ Nginx configuration test failed${NC}"
    exit 1
fi

echo -e "\n${CYAN}=== Setup Complete ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Ensure your domain DNS points to this server via Cloudflare"
echo "  2. In Cloudflare Dashboard → SSL/TLS → Overview, set mode to 'Full (strict)'"
echo "  3. Start your backend: cd $SCRIPT_DIR/.. && ./redeploy.sh"
echo ""
echo "Useful commands:"
echo "  View logs:    sudo tail -f /var/log/nginx/grokicad-api-*.log"
echo "  Test config:  sudo nginx -t"
echo "  Reload:       sudo systemctl reload nginx"
echo "  Status:       sudo systemctl status nginx"

