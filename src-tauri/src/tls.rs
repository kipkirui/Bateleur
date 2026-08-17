use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, Error, RootCertStore, SignatureScheme};
use std::sync::{Arc, OnceLock};

pub fn client_config(trust_anyway: bool) -> Result<ClientConfig, String> {
    if trust_anyway {
        return Ok(ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(TrustAnyway))
            .with_no_client_auth());
    }

    let mut roots = RootCertStore::empty();
    for cert in rustls_native_certs::load_native_certs().certs {
        let _ = roots.add(cert);
    }
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    if roots.is_empty() {
        return Err("No TLS root certificates available.".into());
    }
    Ok(ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth())
}

#[derive(Debug)]
struct TrustAnyway;

impl ServerCertVerifier for TrustAnyway {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &provider().signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

fn provider() -> &'static CryptoProvider {
    static CELL: OnceLock<CryptoProvider> = OnceLock::new();
    CELL.get_or_init(rustls::crypto::aws_lc_rs::default_provider)
}
