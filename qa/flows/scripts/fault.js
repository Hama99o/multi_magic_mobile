// Set ONE fault on qa/fault_proxy.py's control route, clearing the others.
// Maestro runs this on the host, so localhost is the proxy.
//
// env: KIND  500 | 429 | none (clear only)
//      PREFIX a path prefix, e.g. /api/v1/calendar_app
//
// A proxy that is not there must FAIL the flow with a sentence, never crash
// it: a thrown error and a failed assertion look the same in a log. So the
// outcome goes into `output.fault` and the flow asserts it.
var base = "http://localhost:" + (typeof PROXY_PORT !== "undefined" ? PROXY_PORT : "3031") + "/__fault";
try {
  var cleared = http.request(base, { method: "DELETE" });
  if (cleared.status !== 200) {
    output.fault = "proxy refused the clear: " + cleared.status;
  } else if (KIND === "none") {
    output.fault = "set";
  } else {
    var res = http.post(base + "?path=" + encodeURIComponent(PREFIX) + "&kind=" + KIND, { body: "" });
    output.fault = res.status === 200 ? "set" : "proxy refused the fault: " + res.status;
  }
} catch (e) {
  output.fault = "the fault proxy is not answering on " + base;
}
