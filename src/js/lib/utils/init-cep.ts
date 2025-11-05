import { company, displayName, version } from "../../../shared/shared";
import { dispatchTS, openLinkInBrowser } from "./bolt";
import { keyRegisterOverride, dropDisable } from "./cep";

const buildFlyoutMenu = () => {
  const menu = `<Menu>
  <MenuItem Id="info" Label="${displayName} ${version}" Enabled="false" Checked="false"/>
  <MenuItem Id="website" Label="by ${company}" Enabled="false" Checked="false"/>
  <MenuItem Label="---" />
  <MenuItem Id="refresh" Label="Refresh" Enabled="true" Checked="false"/>
  </Menu>`;

  interface FlyoutMenuEvent {
    data:
      | {
          menuId: string;
        }
      | string;
  }
  const flyoutHandler = (event: FlyoutMenuEvent) => {
    let menuId;
    if (typeof event.data === "string") {
      try {
        //? On build the events come in garbled string which requires some replacing and then parsing to get the data
        menuId = JSON.parse(
          event.data.replace(/\$/g, "").replace(/\=2/g, ":")
        ).menuId;
      } catch (e) {
        console.error(e);
      }
    } else {
      menuId = event.data.menuId;
    }
    if (menuId === "website") {
      // openLinkInBrowser(homePage);
    } else if (menuId === "info") {
      // openLinkInBrowser(productPage);
    } else if (menuId === "refresh") {
      // Reload panel - ensure we stay on localhost in dev mode
      if (typeof window !== "undefined" && (window as any).location) {
        const currentUrl = (window as any).location.href;
        if (currentUrl.includes('localhost:3001')) {
          // Already on localhost - just reload
          (window as any).location.reload();
        } else {
          // Not on localhost - redirect to localhost first
          (window as any).location.href = 'http://localhost:3001/main/index.html';
        }
      }
    }
  };

  window.__adobe_cep__.invokeSync("setPanelFlyoutMenu", menu);
  window.__adobe_cep__.addEventListener(
    "com.adobe.csxs.events.flyoutMenuClicked",
    flyoutHandler
  );
};

const buildContextMenu = () => {
  console.log("buildContextMenu");
  const menuObj = {
    menu: [
      {
        label: "Reload",
        enabled: true,
        checked: false,
        checkable: false,
        id: "c-0",
        callback: () => {
          // Reload panel - ensure we stay on localhost in dev mode
          if (typeof window !== "undefined" && (window as any).location) {
            const currentUrl = (window as any).location.href;
            if (currentUrl.includes('localhost:3001')) {
              // Already on localhost - just reload
              (window as any).location.reload();
            } else {
              // Not on localhost - redirect to localhost first
              (window as any).location.href = 'http://localhost:3001/main/index.html';
            }
          }
        },
      },
      {
        label: "Force Reload",
        enabled: true,
        checked: false,
        checkable: false,
        id: "c-1",
        callback: () => {
          process.abort();
        },
      },
    ],
  };
  window.__adobe_cep__.invokeAsync(
    "setContextMenuByJSON",
    JSON.stringify(menuObj),
    (e: string) => {
      menuObj.menu.find((m) => m.id === e)?.callback();
    }
  );
};

export const initializeCEP = () => {
  buildFlyoutMenu();
  buildContextMenu();
  // keyRegisterOverride(); // Capture all Key Events Possible (many limitations on MacOS)
  dropDisable(); // to prevent drop files on panel and taking over
};

