import { staticClasses } from "@decky/ui";
import { addEventListener, definePlugin, removeEventListener } from "@decky/api";
import { FaBook } from "react-icons/fa";
import { App, LINK_EVENT } from "./App";

export default definePlugin(() => {
  // the backend emits "link_received" when a phone posts a link to the receiver (only open on the QR screen)
  const listener = addEventListener<[url: string]>("link_received", url => {
    window.dispatchEvent(new CustomEvent(LINK_EVENT, { detail: url }));
  });

  return {
    name: "D4 Build Viewer",
    titleView: <div className={staticClasses.Title}>D4 Build Viewer</div>,
    content: <App />,
    icon: <FaBook />,
    onDismount() {
      removeEventListener("link_received", listener);
    }
  };
});
