# ADR 0001: Use official Xray-core

Status: Accepted

## Decision

Run a pinned official XTLS/Xray-core build as a child process. Use official Wintun distributed with a compatible build for TUN. Do not embed or copy competitor client code.

## Rationale

The product targets VLESS, REALITY, XTLS-Vision, and XHTTP. Xray supports these protocols directly and its MPL-2.0 license is compatible with process separation and a separately distributed GUI, subject to final specialist review.

## Consequences

The client must verify artifact SHA-256 hashes, retain third-party notices and license texts, generate typed configuration, validate it with the pinned executable before network mutation, capture process output safely, and manage only processes it started. Release packaging and licensing must receive specialist review; this ADR is not legal advice.
