# Mister VPN architecture

Mister VPN is a Windows 10/11 x64 desktop client built on .NET 8 and WPF. The UI invokes application use cases only. Application code owns orchestration through interfaces; infrastructure and Xray projects implement those interfaces. Domain contains dependency-free models and the connection state machine. A narrowly scoped elevated helper will perform only authenticated, allow-listed administrative operations.

Dependency direction is `App -> Application -> Domain`; `Infrastructure` and `Xray` depend inward and are composed at the application boundary. The UI must never directly launch Xray or mutate proxy, DNS, routes, adapters, or firewall state.

Network mutation will be transactional: write a recovery journal before changing state, validate a generated Xray configuration with the pinned core, apply changes, and restore the exact prior state on disconnect or failure. Secrets use Windows DPAPI for the current user and are redacted from logs and diagnostic exports.

The legacy prototype under `desktop_client/` remains untouched while the modular client is developed and verified.
