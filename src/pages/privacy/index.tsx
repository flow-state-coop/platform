import Link from "next/link";
import Container from "react-bootstrap/Container";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Privacy() {
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
      <h1>Privacy Policy</h1>
      <p className="text-info">Flow State</p>
      <p className="fs-5">Last Updated: 15 November 2024</p>
      <p className="fs-5 mt-1">
        This privacy policy (“Policy”) describes how Flow State LCA, a
        Colorado-based limited cooperative association (referred to herein as
        “Flow State”, the “Cooperative”, “we”, “our”, or “us”) collects, uses,
        shares, and stores personal information of users of this website,
        https://flowstate.network/ (the “Site”). This Policy applies to the
        Site, subsite, applications, products, and services (collectively,
        “Services”) on or in which it is posted, linked, or referenced.
      </p>
      <p className="mt-3 fs-4">High-Level Summary</p>
      <p className="fs-5">
        By using the Services, you accept the terms of this Policy and our{" "}
        <Link href="/terms">Terms of Use</Link>, and consent to our collection,
        use, disclosure, and retention of your information as described in this
        Policy. If you have not done so already, please also review our Terms of
        Use. The terms of use contain provisions that limit our liability to you
        and require you to resolve any dispute with us on an individual basis
        and not as part of any class or representative action. IF YOU DO NOT
        AGREE WITH ANY PART OF THIS PRIVACY POLICY OR OUR TERMS OF USE, THEN
        PLEASE DO NOT USE ANY OF THE SERVICES.
      </p>
      <p className="fs-5">
        Flow State does not collect and/or store personal data, such as first
        name, last name, street address, date of birth, email address, or IP
        address, in connection with your use of the Services.
      </p>
      <p className="fs-5">
        Flow State collects non-identifiable data, such as public on-chain data,
        and off-chain data like device type, browser version, pages you view,
        page interactions, etc. We use an EU-based PostHog service for
        anonymized web analytics and session replays. We mask all input values
        and any personally identifying information in session replays because we
        have no interest in identifying individual users. These efforts help
        drive production vision and optimize user experiences.
      </p>
      <p className="fs-5">
        If you specifically sign up to receive emails from us, we will store
        your email address to allow us to send you those emails. You can
        unsubscribe at any time.
      </p>
      <p className="fs-5">
        Flow State will continue to explore methods to protect consumers'
        privacy.
      </p>
      <p className="fs-5">
        Users are empowered to explore client-side privacy techniques and tools.
      </p>
      <p className="fs-5">
        Any material changes to privacy will be reflected in an updated privacy
        policy.
      </p>
      <p className="fs-4">Data We Collect</p>
      <p className="fs-5">
        We are not motivated to collect your data beyond what is required by law
        and to provide you with excellent user experiences. We strive to be
        transparent in the data we do collect. When you interact with the
        Services, we collect only:
      </p>
      <i>Publicly-available blockchain data</i>
      <p className="fs-5 mt-1">
        When you connect your non-custodial blockchain wallet to the Services,
        we may collect and log your publicly-available blockchain address to
        learn more about your use of the Services and to screen your wallet for
        any prior illicit activity. We may screen your wallet using intelligence
        provided by leading blockchain analytics providers. Note that blockchain
        addresses are publicly-available data that are not created or assigned
        by us or any central party, and by themselves are not personally
        identifying.
      </p>
      <i>Web analytics and browser sessions‍</i>
      <p className="fs-5 mt-1">
        We do not use cookies or similar technologies to track you across
        sessions. We and our third-party services providers (e.g. PostHog) may
        access and collect information from localStorage and your browser to
        track masked and/or aggregated activity during individual sessions to
        help improve the product. For example, we may see that many users are
        stopping at a specific step during the donation checkout flow and will
        use sessions to identify how to improve it. Information we collect from
        these technologies may include things such as browser type,
        referring/exit pages, operating system, device or browser language, and
        interface interactions.
      </p>
      <i>Country of origin</i>
      <p className="fs-5 mt-1">
        We use PostHog to identify the country of origin for sessions based on
        IP address. Our data pipeline filters and removes information more
        granular than the IP-inferred country of origin before storage. This
        information is used to broadly understand our usage demographics.
      </p>
      <i>Information from other sources</i>
      <p className="fs-5 mt-1">
        We may receive information about your wallet address or transactions
        made through the Services from our service providers in order to comply
        with our legal obligations and prevent the use of our Services in
        connection with fraudulent or other illicit activities.
      </p>
      <i>Survey or usability information</i>
      <p className="fs-5 mt-1">
        If you participate in a survey or usability study with us, we will
        record any biographical information you directly provide to us (for
        example, your name, email, and job title), the responses you provide to
        us, and your interactions with the Services.
      </p>
      <i>Correspondence</i>
      <p className="fs-5 mt-1">
        We will receive any communications and information you provide directly
        to us via email, customer support, social media, or another support
        channel (such as Telegram, X, or Discord), or when you participate in
        any surveys or questionnaires.
      </p>
      <i>Biographical information</i>
      <p className="fs-5 mt-1">
        If you apply for membership in the Flow State cooperative, we will
        collect information you provide to us through a form, including name,
        email, and wallet address. If you apply for a job with us, we will
        collect information through a form, including name, email phone, work
        and immigration status, and any other resume, cover letter, or free form
        text you include.
      </p>
      <i>Information you specifically provide us</i>
      <p className="fs-5 mt-1">
        If you specifically provide us with information (such as your email
        address or other contact information), we may use that information for
        the purposes described when you provide it to us. You do not need to
        provide us with any personal data to use the Services.
      </p>
      <p className="mt-3 fs-4">How We Use Data</p>
      <p className="fs-5">
        We use the data we collect in accordance with your instructions,
        including any applicable terms in our Terms of Service, and as required
        by law. We may also use data for the following purposes:
      </p>
      <i>Providing the Services</i>
      <p className="fs-5 mt-1">
        We use the data we collect to provide, maintain, customize and improve
        our Services and features of our Services.
      </p>
      <i>Customer support</i>
      <p className="fs-5 mt-1">
        We may use information to provide customer support for and answer
        inquiries about the Services.
      </p>
      <i>Safety and security</i>
      <p className="fs-5 mt-1">
        We may use data to protect against, investigate, and stop fraudulent,
        unauthorized, or illegal activity. We may also use it to address
        security risks, solve potential security issues such as bugs, enforce
        our agreements, and protect our users and Cooperative.
      </p>
      <i>Legal compliance</i>
      <p className="fs-5 mt-1">
        We may use the information we collect as needed or requested by
        regulators, government entities, and law enforcement to comply with
        applicable laws and regulations.
      </p>
      <i>Aggregated data</i>
      <p className="fs-5 mt-1">
        We may use some of the information we collect or access to compile
        aggregated data that helps us learn more about how users use the
        Services and where we can improve your experience.
      </p>
      <i>Replay sessions</i>
      <p className="fs-5 mt-1">
        We may use masked reproductions of single application sessions. This
        helps us find product insights by observing natural user behavior and
        identifying where we can improve your experience.
      </p>
      <p className="fs-4 mt-3">How We Share Data</p>
      <p className="fs-5">We may share or disclose the data we collect:</p>
      <i>With service providers</i>
      <p className="fs-5 mt-1">
        We may share your information with our service providers and vendors to
        assist us in providing, delivering, and improving the Services. For
        example, we may share your wallet address with service providers like
        Infura and Cloudflare to provide technical infrastructure services, your
        wallet address with blockchain analytics providers to detect, prevent,
        and mitigate financial crime and other illicit or harmful activities,
        and your activity on our social media pages with our analytics provider
        to learn more about you interact with us and the Services.
      </p>
      <i>To comply with our legal obligations</i>
      <p className="fs-5 mt-1">
        We may share your data in the course of litigation, regulatory
        proceedings, compliance measures, and when compelled by subpoena, court
        order, or other legal procedure. We may also share data when we believe
        it is necessary to prevent harm to our users, our Cooperative, or
        others, and to enforce our agreements and policies, including our Terms
        of Service.
      </p>
      <i>Safety and Security</i>
      <p className="fs-5 mt-1">
        We may share data to protect against, investigate, and stop fraudulent,
        unauthorized, or illegal activity. We may also use it to address
        security risks, solve potential security issues such as bugs, enforce
        our agreements, and protect our users, Cooperative, and ecosystem.
      </p>
      <i>Business changes</i>
      <p className="fs-5 mt-1">
        We may transfer or share data to another entity in the event of a
        merger, acquisition, bankruptcy, dissolution, reorganization, asset or
        stock sale, or other business transaction.
      </p>
      <i>With your consent</i>
      <p className="fs-5 mt-1">
        We may share your information any other time you provide us with your
        consent to do so.
      </p>
      <p className="fs-5">
        We do not share or sell your information with any third parties for any
        marketing purposes whatsoever.
      </p>
      <i>Third-Party Links and Sites</i>
      <p className="fs-5 mt-1">
        We may integrate technologies operated or controlled by other parties
        into parts of the Services. For example, the Services may include links
        that hyperlink to websites, platforms, and other services not operated
        or controlled by us. Please note that when you interact with these other
        parties, including when you leave the Site, those parties may
        independently collect information about you and solicit information from
        you. You can learn more about how those parties collect and use your
        data by consulting their privacy policies and other terms.
      </p>
      <i>Security</i>
      <p className="fs-5 mt-1">
        We implement and maintain reasonable administrative, physical, and
        technical security safeguards to help protect data from loss, theft,
        misuse, unauthorized access, disclosure, alteration, and destruction.
        Nevertheless, transmission via the internet is not completely secure and
        we cannot guarantee the security of information about you. You are
        responsible for all of your activity on the Services, including the
        security of your blockchain network addresses, cryptocurrency wallets,
        and their cryptographic keys.
      </p>
      <i>Age Requirements</i>
      <p className="fs-5 mt-1">
        The Services are intended for a general audience and are not directed at
        children. We do not knowingly receive personal information (as defined
        by the U.S. Children’s Privacy Protection Act, or “COPPA”) from
        children. If you believe we have received personal information about a
        child under the age of 18, please contact us at info@flowstate.network.
      </p>
      <p className="mt-3 fs-4">Unique Jurisdictions</p>
      <i>Additional Notice to California Residents (“CCPA Notice”)</i>
      <p className="fs-5 mt-1">
        The California Consumer Privacy Act of 2018 (“CCPA”) requires certain
        businesses to provide a CCPA Notice to California residents to explain
        how we collect, use, and share their personal information, and the
        rights and choices we offer California residents regarding our handling
        of their information.
      </p>
      <i>Privacy Practices</i>
      <p className="fs-5 mt-1">
        We do not “sell” personal information as defined under the CCPA. Please
        review the “How We Share Data” section above for further details about
        the categories of parties with whom we share information.
      </p>
      <i>Privacy Rights</i>
      <p className="fs-5 mt-1">
        The CCPA gives individuals the right to request information about how we
        have collected, used, and shared your personal information. It also
        gives you the right to request a copy of any information we may maintain
        about you. You may also ask us to delete any personal information that
        we may have received about you. Please note that the CCPA limits these
        rights, for example, by prohibiting us from providing certain sensitive
        information in response to access requests and limiting the
        circumstances under which we must comply with a deletion request. We
        will respond to requests for information, access, and deletion only to
        the extent we are able to associate, with a reasonable effort, the
        information we maintain with the identifying details you provide in your
        request. If we deny the request, we will communicate the decision to
        you. You are entitled to exercise the rights described above free from
        discrimination.
      </p>
      <i>Submitting a Request</i>
      <p className="fs-5 mt-1">
        You can submit a request for information, access, or deletion to
        info@flowstate.network.
      </p>
      <i>Identity Verification</i>
      <p className="fs-5 mt-1">
        The CCPA requires us to collect and verify the identity of any
        individual submitting a request to access or delete personal information
        before providing a substantive response.
      </p>
      <i>Authorized Agents</i>
      <p className="fs-5 mt-1">
        California residents can designate an “authorized agent” to submit
        requests on their behalf. We will require the authorized agent to have a
        written authorization confirming their authority.
      </p>
      <i>Disclosures for European Union Data Subjects</i>
      <p className="fs-5 mt-1">
        We process personal data for the purposes described in the section
        titled “How We Use Data” above. Our bases for processing your data
        include: (i) you have given consent to the process to us or our service
        provides for one or more specific purposes; (ii) processing is necessary
        for the performance of a contract with you; (iii) processing is
        necessary for compliance with a legal obligation; and/or (iv) processing
        is necessary for the purposes of the legitimate interested pursued by us
        or a third party, and your interests and fundamental rights and freedoms
        do not override those interests.
      </p>
      <p className="fs-5">
        Your rights under the General Data Protection Regulations (“GDPR”)
        include the right to (i) request access and obtain a copy of your
        personal data, (ii) request rectification or erasure of your personal
        data, (iii) object to or restrict the processing of your personal data;
        and (iv) request portability of your personal data. Additionally, you
        may withdraw your consent to our collection at any time. Nevertheless,
        we cannot edit or delete information that is stored on a particular
        blockchain. Information such as your transaction data, blockchain wallet
        address, and assets held by your address that may be related to the data
        we collect is beyond our control.
      </p>
      <p className="fs-5">
        To exercise any of your rights under the GDPR, please contact us at
        info@flowstate.network. We may require additional information from you
        to process your request. Please note that we may retain information as
        necessary to fulfill the purpose for which it was collected and may
        continue to do so even after a data subject request in accordance with
        our legitimate interests, including to comply with our legal
        obligations, resolves disputes, prevent fraud, and enforce our
        agreements.
      </p>
      <p className="fs-4 mt-3">Notice Given</p>
      <i>Changes to this Policy</i>
      <p className="fs-5 mt-1">
        If we make material changes to this Policy, we will notify you via the
        Services. Nevertheless, your continued use of the Services reflects your
        periodic review of this Policy and other Cooperative terms, and
        indicates your consent to them.
      </p>
      <i>Contact Us</i>
      <p className="fs-5 mb-5">
        If you have any questions about this Policy or how we collect, use, or
        share your information, please contact us at info@flowstate.network.
      </p>
    </Container>
  );
}
