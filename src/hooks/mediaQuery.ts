import React from "react";

if (!process.browser) {
  React.useLayoutEffect = () => {};
}

function useMediaQuery() {
  const [isMobile, setIsMobile] = React.useState(false);
  const [isTablet, setIsTablet] = React.useState(false);
  const [isSmallScreen, setIsSmallScreen] = React.useState(false);
  const [isMediumScreen, setIsMediumScreen] = React.useState(true);
  const [isBigScreen, setIsBigScreen] = React.useState(false);

  React.useLayoutEffect(() => {
    let remove: (() => void) | null = null;

    const updateMediaScreen = () => {
      if (remove != null) {
        remove();
      }

      const mobileQuery = window.matchMedia("(max-width: 576px)");
      const tabletQuery = window.matchMedia(
        "(min-width: 576px) and (max-width: 992px)",
      );
      const smallScreenQuery = window.matchMedia(
        "(min-width: 1000px) and (max-width: 1440px)",
      );
      const mediumScreenQuery = window.matchMedia(
        "(min-width: 1400px) and (max-width: 1920px)",
      );
      const bigScreenQuery = window.matchMedia("(min-width: 1920px)");

      setIsMobile(mobileQuery.matches);
      setIsTablet(tabletQuery.matches);
      setIsSmallScreen(smallScreenQuery.matches);
      setIsMediumScreen(mediumScreenQuery.matches);
      setIsBigScreen(bigScreenQuery.matches);

      mobileQuery.addEventListener("change", updateMediaScreen);
      tabletQuery.addEventListener("change", updateMediaScreen);
      smallScreenQuery.addEventListener("change", updateMediaScreen);
      mediumScreenQuery.addEventListener("change", updateMediaScreen);
      bigScreenQuery.addEventListener("change", updateMediaScreen);

      remove = () => {
        mobileQuery.removeEventListener("change", updateMediaScreen);
        tabletQuery.removeEventListener("change", updateMediaScreen);
        smallScreenQuery.removeEventListener("change", updateMediaScreen);
        mediumScreenQuery.removeEventListener("change", updateMediaScreen);
        bigScreenQuery.removeEventListener("change", updateMediaScreen);
      };
    };

    updateMediaScreen();

    return () => {
      if (remove) {
        remove();
      }
    };
  }, []);

  return { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen };
}

export { useMediaQuery };
