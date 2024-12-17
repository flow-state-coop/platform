"use client";

type ManagerProps = {
  chainId: number;
  poolAddress: string;
};

export default function Manager(props: ManagerProps) {
  const { poolAddress } = props;

  return <div className="m-auto fs-1">{poolAddress}</div>;
}
