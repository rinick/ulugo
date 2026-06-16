import {Select, Tag} from 'antd';
import type {SelectProps} from 'antd';

type Select12Value<ValueType> = [ValueType] | [ValueType, ValueType];

export type Select12Props<
  ValueType = string,
  OptionType extends Record<string, unknown> = Record<string, unknown>,
> = Omit<SelectProps<ValueType[], OptionType>, 'mode' | 'value' | 'defaultValue' | 'onChange'> & {
  value: Select12Value<ValueType>;
  defaultValue?: Select12Value<ValueType>;
  onChange?: (value: Select12Value<ValueType>, option?: OptionType | OptionType[]) => void;
};

export function Select12<ValueType = string, OptionType extends Record<string, unknown> = Record<string, unknown>>({
  value,
  onChange,
  options,
  tagRender,
  ...props
}: Select12Props<ValueType, OptionType>) {
  const selectedValues = new Set(value);
  const selectedCount = value.length;
  const nextOptions = options?.map((option) => {
    if (selectedCount < 2 || selectedValues.has(option.value as ValueType)) return option;
    return {...option, disabled: true};
  });

  function handleChange(nextValue: ValueType[], option?: OptionType | OptionType[]): void {
    if (nextValue.length < 1 || nextValue.length > 2) return;
    onChange?.(nextValue as Select12Value<ValueType>, option);
  }

  return (
    <Select<ValueType[], OptionType>
      {...props}
      mode="multiple"
      value={value}
      options={nextOptions}
      maxCount={2}
      allowClear={false}
      tagRender={(tagProps) =>
        tagRender == null ? (
          <Tag
            closable={tagProps.closable && selectedCount > 1}
            onClose={tagProps.onClose}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {tagProps.label}
          </Tag>
        ) : (
          tagRender({...tagProps, closable: tagProps.closable && selectedCount > 1})
        )
      }
      onChange={handleChange}
    />
  );
}
