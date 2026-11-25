import React from "react";
import { createRoot } from "react-dom/client";
import Keycloak from "keycloak-js";
import { Workspace } from "./Workspace";
import "./style.css";

const root = createRoot(document.getElementById("root")!);
const origin = window.location.origin;
const identity = new Keycloak({
  url: origin + "/auth",
  realm: "industrial",
  clientId: "erp-web",
});
identity
  .init({
    onLoad: "login-required",
    pkceMethod: "S256",
    checkLoginIframe: false,
  })
  .then(() => {
    root.render(
      <Workspace
        token={async () => {
          await identity.updateToken(15);
          return identity.token!;
        }}
        logout={() => identity.logout({ redirectUri: origin })}
      />,
    );
  })
  .catch(() =>
    root.render(<p>Login indisponível. Recarregue para tentar novamente.</p>),
  );
