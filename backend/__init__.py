"""IncidentMind backend and secure TLS defaults for provider SDKs."""

import os

import certifi

# Some python.org macOS installs have no configured root certificates. Use the
# maintained Mozilla bundle, preserving any explicitly configured trust store.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
