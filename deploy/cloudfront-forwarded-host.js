// CloudFront Function (viewer request, runtime cloudfront-js-2.0) on the financial-tracker distribution.
// The Lambda function URL only accepts its own Host header, so CloudFront replaces it; this passes the
// public host along so Spring builds redirects (sign-in, saved pages) for the CloudFront address.
function handler(event) {
  var request = event.request;
  request.headers['x-forwarded-host'] = { value: request.headers.host.value };
  return request;
}
