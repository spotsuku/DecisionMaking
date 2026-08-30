"use client";

// 日付を選ぶ欄。
//
// input[type=date] は未入力のとき、iOS Safari では中身が何も描かれず、
// ただの空の箱に見える。押せる場所だと分からないので、
// 空のときだけ案内を重ねる(入力そのものは素のinputのまま)。

export function DateField({
  value,
  onChange,
  placeholder = "日付を選ぶ",
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <span className={value ? "datefield" : "datefield novalue"}>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {!value && <span className="ph">{placeholder}</span>}
    </span>
  );
}
