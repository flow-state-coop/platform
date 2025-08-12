import { useState } from "react";

export default function useMailingList() {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isEmailInvalid, setIsEmailInvalid] = useState(false);
  const [mailingListSubSuccess, setMailingListSubSuccess] = useState(false);
  const [mailingListSubError, setMailingListSubError] = useState("");
  const [validated, setValidated] = useState(false);

  const handleMailingListSub = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const form = e.currentTarget;

    setIsSubscribing(true);
    setIsEmailInvalid(false);
    setMailingListSubError("");
    setValidated(true);

    if (form.checkValidity() === true) {
      try {
        const res = await fetch("/api/mailinglist", {
          method: "POST",
          body: JSON.stringify({
            email: (form[0] as HTMLInputElement).value,
          }),
        });

        const data = await res.json();

        if (data.success) {
          setMailingListSubSuccess(true);
        } else {
          setMailingListSubError(data.message);
        }
      } catch (err) {
        console.error(err);
        setMailingListSubError("There was an error, please try again later");
      }
    } else {
      setIsEmailInvalid(true);
    }

    setIsSubscribing(false);
  };

  return {
    isSubscribing,
    isEmailInvalid,
    setIsEmailInvalid,
    mailingListSubSuccess,
    setMailingListSubSuccess,
    mailingListSubError,
    validated,
    handleMailingListSub,
  };
}
