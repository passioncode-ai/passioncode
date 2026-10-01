Contract: brand-contract v1

# CLI terminology

## Product terms: always

| Our term | Never write | Applies to |
|---|---|---|
| installed | current npm version | Installed release |
| package | package already installed | Payload shipped with the invoked CLI |
| npm latest (cached) | latest on npm | Saved registry observation in status |
| check time unknown | checked now | Missing or invalid saved timestamp |

## Entity and tier names: exact spelling

PassionCode.ai; `passioncode`; npm. No tiers are introduced here.

## Banned

Do not describe a cached registry observation as a live lookup.

## Glossary

Stale: in this status message, the cached stable npm version is lower than the
installed stable version. A higher or equal cached version is still only a cache.
