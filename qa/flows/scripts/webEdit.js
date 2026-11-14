// Edit "[qa-edit] scratch" ON THE SERVER, as the web would, while the phone
// has it open: the next phone save must meet the version check (#20) and ask.
// Maestro runs this on the host, so the API is the host's (never 10.0.2.2).
//
// env: API    e.g. http://localhost:3001 (the server the app talks to)
//      EMAIL / PASSWORD   the QA account (passed from MAESTRO_QA_*, never
//                         written in a flow)
//
// The outcome goes into output.webEdit ("edited", or a sentence) and the flow
// asserts it: a thrown error and a failed assertion look the same in a log.
try {
  var login = http.post(API + "/users/login", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: { email: EMAIL, password: PASSWORD } }),
  });
  var token = login.headers && (login.headers.Authorization || login.headers.authorization);
  if (login.status !== 200 || !token) {
    output.webEdit = "QA sign-in refused: " + login.status;
  } else {
    var auth = { "Content-Type": "application/json", Authorization: token };
    var list = http.get(API + "/api/v1/note_app/notes?search=" + encodeURIComponent("[qa-edit] scratch"), { headers: auth });
    var notes = JSON.parse(list.body).notes || [];
    var note = notes.filter(function (n) { return n.title === "[qa-edit] scratch"; })[0];
    if (!note) {
      output.webEdit = "no [qa-edit] scratch note on " + API;
    } else {
      var put = http.put(API + "/api/v1/note_app/notes/" + note.id, {
        headers: auth,
        body: JSON.stringify({ description: (note.description || "") + "<p>Edited on the web (27i).</p>" }),
      });
      output.webEdit = put.status === 200 ? "edited" : "the web edit was refused: " + put.status;
    }
  }
} catch (e) {
  output.webEdit = "the API is not answering on " + API + ": " + e;
}
