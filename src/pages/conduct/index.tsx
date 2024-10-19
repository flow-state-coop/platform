import Link from "next/link";
import Container from "react-bootstrap/Container";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Conduct() {
  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();

  return (
    <Container
      className="mx-auto p-4 mt-5 fs-5"
      style={{
        maxWidth:
          isMobile || isTablet
            ? "100%"
            : isSmallScreen
              ? 800
              : isMediumScreen
                ? 1000
                : 1300,
      }}
    >
      <h1>Code of Conduct</h1>
      <p>
        Flow State’s mission is to grow the public goods economy. Public good
        success is synonymous with creating, promoting, and participating in a
        more **positive-sum** world.
      </p>
      <p>
        Participation in Flow State funding rounds is an opportunity to embody
        these values. Any individual or team found to be violating the spirit of
        this mission through extractive, deceitful, hateful, illegal,
        fraudulent, disruptive, or otherwise negative-sum behavior will be
        subject to immediate removal from any active funding rounds and the
        cancellation of their round-based funding streams.
      </p>
      <p>
        While we won’t attempt to define every behavior that will result in
        immediate removal from the platform (attempting to sneak something past
        just because you weren’t expressly told not to isn’t a positive-sum
        mindset), the following examples of unacceptable actions are provided
        for the elimination of doubt:
      </p>
      <ol className="lh-base">
        <li>
          Recycled Funding: Only “first-touch” funding is eligible for matching
          in Streaming Quadratic Funding and other funding rounds. Using
          multiple accounts, intermediaries, hops, swaps, or other obfustication
          methods doesn’t change the nature of this violation.
        </li>
        <li>
          Sybil Accounts & Matching Calculation Manipulation: Don’t create,
          encourage, or recruit multiple accounts controlled by the same
          individual or group to participate in funding rounds. Don’t otherwise
          attempt to “game” the matching calculation.
        </li>
        <li>
          Bribes: Builders should build relationships and exchange long-term
          value with their supporters. Builders should NOT pay for or fund their
          supporter’s funding streams.
        </li>
        <li>
          Bribes: Builders should build relationships and exchange long-term
          value with their supporters. Builders should NOT pay for or fund their
          supporter’s funding streams.
        </li>
        <li>
          Deceit, Falsification, Impersonation, & Fraud: Don’t do those things.
          Be yourself. Be forthcoming. Be honest.
        </li>
        <li>Hateful Content: Don’t tear anyone else down.</li>
      </ol>
      <p className="mb-5">
        This Code of Conduct is applied in addition to the Flow State platform’s
        standard{" "}
        <Link href="/terms" className="text-decoration-underline">
          Terms of Use
        </Link>
        . Operators may choose to enforce additional criteria and rules for
        grantee/voter participation in their rounds.
      </p>
    </Container>
  );
}
