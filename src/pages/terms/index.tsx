import Link from "next/link";
import Container from "react-bootstrap/Container";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Terms() {
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
      <h1>Terms of Use</h1>
      <p className="text-info">Flow State</p>
      <p className="fs-5">Last Updated: 18 October 2024</p>
      <i>Acceptance of Terms</i>
      <p className="fs-5 mt-1">
        Flow State LCA, a Colorado-based limited cooperative association
        (referred to herein as “Flow State”, “we”, “our”, or “us”), provides a
        blockchain-based toolkit enabling individuals and communities (“Users”)
        to build, fund, and make collective decisions for shared impact. This is
        done through the development and exposure of open source software that
        allows Users to interact with Flow State and its technology components,
        community, and resources.
      </p>
      <p className="fs-5">
        These Terms of Use (the "Agreement", or “Terms”) explain the terms and
        conditions by which you may access and use the products and protocols
        provided by Flow State. The products and protocols (the “Services”)
        shall include, but shall not necessarily be limited to Streaming
        Quadratic Funding, the Flow State website (http://flowstate.network/),
        Flow State Patronage, and other partnered products denoted with Flow
        State’s brandmark. By using or otherwise accessing the Services, or
        clicking to accept or agree to these Terms where that option is made
        available, you accept and agree to these Terms, consent to the
        collection, use, disclosure and other handling of information as
        described in our{" "}
        <Link href="/privacy" className="text-decoration-underline">
          Privacy Policy
        </Link>{" "}
        and any additional terms, rules and conditions of participation issued
        by Flow State from time to time.
      </p>
      <i>Modifications of Terms of Use</i>
      <p className="fs-5 mt-1">
        Flow State reserves the right, at its sole discretion, to modify or
        replace the Terms of Use at any time. The most current version of these
        Terms will be posted on our Site. You shall be responsible for reviewing
        and becoming familiar with any such modifications. Use of the Services
        by you after any modification to the Terms constitutes your acceptance
        of the Terms of Use as modified.
      </p>
      <i>Eligibility</i>
      <p className="fs-5 mt-1">
        You represent and warrant that you: (a) are of legal age to form a
        binding contract; (e.g., 18 years old in the United States) (b) have not
        previously been suspended or removed from using our Services; and (c)
        have full power and authority to enter into this agreement and in doing
        so will not violate any other agreement to which you are a party. If you
        are registering to use the Services on behalf of a legal entity, you
        further represent and warrant that such legal entity is duly organized
        and validly existing under the applicable laws of the jurisdiction of
        its organization, and you are duly authorized by such legal entity to
        act on its behalf.
      </p>
      <p className="fs-5">
        You further represent that you are not (a) the subject of economic or
        trade sanctions administered or enforced by any governmental authority
        or otherwise designated on any list of prohibited or restricted parties
        (including but not limited to the list maintained by the Office of
        Foreign Assets Control of the U.S. Department of the Treasury) or (b) a
        citizen, resident, or organized in a jurisdiction or territory that is
        the subject of comprehensive country-wide, territory-wide, or regional
        economic sanctions by the United States. Finally, you represent that
        your access and use of any of our Services will fully comply with all
        applicable laws and regulations, and that you will not access or use any
        of our Services to conduct, promote, or otherwise facilitate any illegal
        activity.
      </p>
      <p className="fs-5 mb-3">
        NOTICE: This Agreement contains important information, including a
        binding arbitration provision and a class action waiver, both of which
        impact your rights as to how disputes are resolved. Our Services are
        only available to you — and you should only access any of our Services —
        if you agree completely with these Terms.
      </p>
      <p className="fs-4">Your Responsibilities</p>
      <i>Prohibited Activity</i>
      <p className="fs-5 mt-1">
        You agree not to engage in, or attempt to engage in, any of the
        following categories of prohibited activity in relation to your access
        and use of the Services:
      </p>
      <i>Intellectual Property Infringement</i>
      <p className="fs-5 mt-1">
        Activity that infringes on or violates any copyright, trademark, service
        mark, patent, right of publicity, right of privacy, or other proprietary
        or intellectual property rights under the law.
      </p>
      <i>Cyberattack</i>
      <p className="fs-5 mt-1">
        Activity that seeks to interfere with or compromise the integrity,
        security, or proper functioning of any computer, server, network,
        personal device, or other information technology system, including, but
        not limited to, the deployment of viruses and denial of service attacks.
      </p>
      <i>Fraud and Misrepresentation</i>
      <p className="fs-5 mt-1">
        Activity that seeks to defraud us or any other person or entity,
        including, but not limited to, providing any false, inaccurate, or
        misleading information in order to unlawfully obtain the property of
        another.
      </p>
      <i>Market Manipulation</i>
      <p className="fs-5 mt-1">
        Activity that violates any applicable law, rule, or regulation
        concerning the integrity of trading markets, including, but not limited
        to, the manipulative tactics commonly known as "rug pulls", pumping and
        dumping, and wash trading.
      </p>
      <i>Securities and Derivatives Violations</i>
      <p className="fs-5 mt-1">
        Activity that violates any applicable law, rule, or regulation
        concerning the trading of securities or derivatives, including, but not
        limited to, the unregistered offering of securities and the offering of
        leveraged and margined commodity products to retail customers in the
        United States.
      </p>
      <i>Sale of Stolen Property</i>
      <p className="fs-5 mt-1">
        Buying, selling, or transferring of stolen items, fraudulently obtained
        items, items taken without authorization, and/or any other illegally
        obtained items.
      </p>
      <i>Data Mining or Scraping</i>
      <p className="fs-5 mt-1">
        Activity that involves data mining, robots, scraping, or similar data
        gathering or extraction methods of content or information from any of
        our Products.
      </p>
      <i>Objectionable Content</i>
      <p className="fs-5 mt-1">
        Activity that involves soliciting information from anyone under the age
        of 18 or that is otherwise harmful, threatening, abusive, harassing,
        tortious, excessively violent, defamatory, vulgar, obscene,
        pornographic, libelous, invasive of another's privacy, hateful,
        discriminatory, or otherwise objectionable.
      </p>
      <i>Any Other Unlawful Conduct</i>
      <p className="fs-5 mt-1 mb-3">
        Activity that violates any applicable law, rule, or regulation of the
        United States or another relevant jurisdiction, including, but not
        limited to, the restrictions and regulatory requirements imposed by U.S.
        law.
      </p>
      <p className="fs-4">Transactions</p>
      <p className="fs-5">
        You agree and understand that: (a) all transactions you submit through
        any of our Services are considered unsolicited, which means that they
        are solely initiated by you; (b) you have not received any investment
        advice from us in connection with any transactions; and (c) we do not
        conduct a suitability review of any transactions you submit.
      </p>
      <p className="fs-4">Non-Custodial and No Fiduciary Duties</p>
      <p className="fs-5">
        Each of the Services is a purely non-custodial application, meaning we
        do not ever have custody, possession, or control of your digital assets
        at any time. It further means you are solely responsible for the custody
        of the cryptographic private keys to the digital asset wallets you hold
        and you should never share your wallet credentials or seed phrase with
        anyone. We accept no responsibility for, or liability to you, in
        connection with your use of a wallet and make no representations or
        warranties regarding how any of our Products will operate with any
        specific wallet. Likewise, you are solely responsible for any associated
        wallet and we are not liable for any acts or omissions by you in
        connection with or as a result of your wallet being compromised.
      </p>
      <p className="fs-5">
        This Agreement is not intended to, and does not, create or impose any
        fiduciary duties on us. To the fullest extent permitted by law, you
        acknowledge and agree that we owe no fiduciary duties or liabilities to
        you or any other party, and that to the extent any such duties or
        liabilities may exist at law or in equity, those duties and liabilities
        are hereby irrevocably disclaimed, waived, and eliminated. You further
        agree that the only duties and obligations that we owe you are those set
        out expressly in this Agreement.
      </p>
      <p className="fs-4">Compliance and Tax Obligations</p>
      <p className="fs-5">
        One or more of our Products may not be available or appropriate for use
        in your jurisdiction. By accessing or using any of our Products, you
        agree that you are solely and entirely responsible for compliance with
        all laws and regulations that may apply to you.
      </p>
      <p className="fs-5">
        Specifically, your use of our Products or the Protocol may result in
        various tax consequences, such as income or capital gains tax,
        value-added tax, goods and services tax, or sales tax in certain
        jurisdictions.
      </p>
      <p className="fs-5">
        It is your responsibility to determine whether taxes apply to any
        transactions you initiate or receive and, if so, to report and/or remit
        the correct tax to the appropriate tax authority.
      </p>
      <p className="fs-4">Role of Flow State</p>
      <p className="fs-5">
        Flow State is not involved in the transactions between users, and has no
        control over the quality, safety, or legality of tasks or consideration
        for tasks, the ability of users to perform tasks to others'
        satisfaction, or the ability of users to pay for tasks. Flow State will
        not have any liability or obligations under or related to Service
        Contracts for any acts or omissions by you or other Users. Flow State
        has no control over users or the services offered or rendered by users
        and Flow State makes no representations as to the reliability,
        capability, or qualifications of any user or the quality, security, or
        legality of any services, and Flow State disclaims any and all liability
        relating thereto.
      </p>
      <p className="fs-4">Flow State Streaming Grants</p>
      <p className="fs-5">
        In addition to the above, but notwithstanding anything to the contrary
        therein, if you use the Services to start a streaming grant (a “Grant”)
        to a User, you agree that: (a) the User has broad discretion in
        performing the tasks described on its project page on our website (the
        “Grant Project Page”), including what, how and when they perform such
        tasks, and how they use the Grant; (b) the Grant will be made to the
        User on a continuous basis, commencing at the time that you agree to
        make the Grant; (c) the User may change the tasks, including without
        limitation the scope and timeline; (d) Grant contributions will be
        continuously issued and remitted to the User prior to the User
        completing all tasks; (e) the Grant is not refundable; (f) you will not
        have the ability on the Services to dispute or reject tasks performed by
        Users, but you may terminate your continuous Grant contributions at any
        time; (g) if your wallet balance reaches zero, your Grant stream can be
        terminated and result in the loss of the associated buffer deposit; and
        (h) you and User are responsible for any tax liabilities in connection
        with your transaction.
      </p>
      <p className="fs-4">Restrictions on Use</p>
      <p className="fs-5">
        Unless otherwise expressly authorized in these Terms of Use or on the
        Services, you may not take any action to interfere with the Services or
        any other user’s use of the Services or decompile, reverse engineer, or
        disassemble any content or other products or processes accessible
        through the Services, nor insert any code or product or manipulate the
        content in any way that affects any User’s experience. While using the
        Services you are required to comply with all applicable statutes,
        orders, regulations, rules, and other laws. In addition, we expect users
        of the Services to respect the rights and dignity of others. Your use of
        the Services is conditioned on your compliance with the rules of conduct
        set forth in this Section.
      </p>
      <p className="fs-4">Warranty Disclaimer</p>
      <p className="fs-5">
        You expressly understand and agree that your use of the Services is at
        your sole risk. The Services are provided on an "AS IS" and "as
        available" basis, without warranties of any kind, either express or
        implied, including, without limitation, implied warranties of
        merchantability, fitness for a particular purpose or non-infringement.
        You release Flow State from all liability for content you acquired or
        failed to acquire through the Services.
      </p>
      <p className="fs-4">Indemnity</p>
      <p className="fs-5">
        You agree, to the fullest extent permitted by applicable law, to release
        and to indemnify, defend, and hold harmless Flow State and its parents,
        subsidiaries, affiliates, and agencies, as well as the officers,
        directors, employees, members, shareholders, and representatives of any
        of the foregoing entities, from and against any and all losses,
        liabilities, expenses, damages, costs (including attorneys’ fees and
        court costs) claims or actions of any kind whatsoever arising or
        resulting from: (a) your use of the Service, (b) your violation of these
        Terms of Use, (c) any of your acts or omissions that implicate publicity
        rights, defamation, invasion of privacy, confidentiality, intellectual
        property rights or other property rights, (d) your User Generated
        Content, (e) any misrepresentation by you and (f) any disputes or issues
        between you and any third party. Flow State reserves the right, at its
        own expense, to assume exclusive defense and control of any matter
        otherwise subject to indemnification by you and, in such case, you agree
        to cooperate with Flow State in the defense of such matter.
      </p>
      <p className="fs-4">Limitation on Liability</p>
      <p className="fs-5">
        You acknowledge and agree that you assume full responsibility for your
        use of the Services. You acknowledge and agree that any information you
        send or receive during your use of the Services may not be secure and
        may be intercepted or later acquired by unauthorized parties. You
        acknowledge and agree that your use of the Services is at your own risk.
        Recognizing such, you understand and agree that, to the fullest extent
        permitted by applicable law, neither Flow State nor its parents,
        subsidiaries, affiliates and agencies, as well as the officers,
        directors, employees, shareholders or representatives of any of the
        foregoing entities, or its suppliers or licensors will be liable to you
        for any direct, indirect, incidental, special, consequential, punitive,
        exemplary or other damages of any kind, including without limitation
        damages for loss of profits, goodwill, use, data or other tangible or
        intangible losses or any other damages based on contract, tort
        (including, in jurisdictions where permitted, negligence and gross
        negligence), strict liability or any other theory (even if Flow State
        had been advised of the possibility of such damages), resulting from the
        Services; the use or the inability to use the Services; unauthorized
        access to or alteration of your transmissions or data; statements or
        conduct of any third party on the Services; any actions we take or fail
        to take as a result of communications you send to us; human errors;
        technical malfunctions; failures, including public utility or telephone
        outages; omissions, interruptions, latency, deletions or defects of any
        device or network, providers, or software (including, but not limited
        to, those that do not permit participation in the Service); any injury
        or damage to computer equipment; inability to fully access the Services
        or any other website; theft, tampering, destruction, or unauthorized
        access to, images or other content of any kind; data that is processed
        late or incorrectly or is incomplete or lost; typographical, printing or
        other errors, or any combination thereof; or any other matter relating
        to the Services. Some jurisdictions do not allow the exclusion of
        certain warranties or the limitation or exclusion of liability for
        incidental or consequential damages. Accordingly, some of the above
        limitations may not apply to you.
      </p>
      <p className="fs-4">Intellectual Property Rights</p>
      <i>IP Rights Generally</i>
      <p className="mt-1 fs-5">
        The Services and their entire contents, features, and functionality
        (including but not limited to all information, software, text, displays,
        images, video, and audio, and the design, selection, and arrangement
        thereof) may be owned by us, our third-party licensors, or other
        providers of such material and are protected by United States and
        international copyright, trademark, patent, trade secret, and other
        intellectual property or proprietary rights laws
      </p>
      <p className="fs-5">
        The Services may contain or be provided with components subject to the
        terms and conditions of open source software licenses. To the extent
        applicable, the we will identify such open source software included on
        or provided through the Services. To the extent required by the license
        that accompanies such open source software, the terms of such license
        will apply in lieu of these Terms of Service with respect to such open
        source software, including, without limitation, any provisions governing
        access to source code, modifications or reverse engineering.
      </p>
      <p className="fs-5">
        If you print, copy, modify, download, or otherwise use or provide any
        other person with access to any part of the Services in breach of the
        Terms of Service, your right to use the Services will stop immediately.
        No right, title, or interest in or to the Services or any content on the
        Services is transferred to you, and all rights not expressly granted are
        reserved by Flow State. Any use of the Services not expressly permitted
        by these Terms of Service is a breach of these Terms of Service and may
        violate copyright, trademark, and other laws.
      </p>
      <p className="fs-5">
        Certain of our services use licensed material, including but not limited
        to code base, logos and branding elements from third-parties. To the
        extent these Terms of Service conflict with the terms and conditions of
        any third party, the terms and conditions of the applicable third-party
        license shall control, but solely with respect to such content.
      </p>
      <p className="fs-5">
        By using any of our Services, you grant us a worldwide, non-exclusive,
        sublicensable, royalty-free license to use, copy, modify, and display
        any content, including but not limited to text, materials, images,
        files, communications, comments, feedback, suggestions, ideas, concepts,
        questions, data, or otherwise, that you post on or through any of our
        Services for our current and future business purposes, including to
        provide, promote, and improve the Services. This includes any digital
        file, art, or other material linked to or associated with any content
        displayed. You grant to us a non-exclusive, transferable, worldwide,
        perpetual, irrevocable, fully-paid, royalty-free license, with the right
        to sublicense, under any and all intellectual property rights that you
        own or control to use, copy, modify, create derivative works based upon
        any suggestions or feedback for any purpose.
      </p>
      <p className="fs-5">
        You represent and warrant that you have, or have obtained, all rights,
        licenses, consents, permissions, power and/or authority necessary to
        grant the rights granted herein for any material that you list, post,
        promote, or display on or through any of our Products (including, but
        not limited to, NFTs). You represent and warrant that such content does
        not contain material subject to copyright, trademark, publicity rights,
        or other intellectual property rights, unless you have necessary
        permission or are otherwise legally entitled to post the material and to
        grant us the license described above, and that the content does not
        violate any laws.
      </p>
      <i>Third-Party Resources and Promotions</i>
      <p className="fs-5 mt-1">
        Our Services may contain references or links to third-party resources,
        including, but not limited to, information, materials, products, or
        services, that we do not own or control. In addition, third parties may
        offer promotions related to your access and use of our Services. We do
        not approve, monitor, endorse, warrant or assume any responsibility for
        any such resources or promotions. If you access any such resources or
        participate in any such promotions, you do so at your own risk, and you
        understand that this Agreement does not apply to your dealings or
        relationships with any third parties. You expressly relieve us of any
        and all liability arising from your use of any such resources or
        participation in any such promotions.
      </p>
      <i>Additional Rights</i>
      <p className="fs-5 mt-1">
        We reserve the right to cooperate with any law enforcement, court or
        government investigation or order or third party requesting or directing
        that we disclose information or content or information that you provide.
      </p>
      <p className="fs-5 mb-5">
        Governing Law These Terms of Use shall be governed by and construed in
        accordance with the laws of the State of Colorado, without giving effect
        to any principles of conflicts of law.
      </p>
    </Container>
  );
}
