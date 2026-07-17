import {Button, Dropdown, Select, type ButtonProps, type MenuProps, type SelectProps} from 'antd';
import type {ReactNode} from 'react';
import {type AppLanguage, languageOptions} from '../app/localizationUtils';

interface LanguageSelectOption {
  value: AppLanguage;
  label: ReactNode;
}

type LanguageSelectProps = Omit<SelectProps<AppLanguage, LanguageSelectOption>, 'value' | 'onChange' | 'options'> & {
  value: AppLanguage;
  onChange: (language: AppLanguage) => void;
};

interface LanguageDropdownProps {
  value: AppLanguage;
  size?: ButtonProps['size'];
  ariaLabel: string;
  onChange: (language: AppLanguage) => void;
}

function LanguageFlag({src}: {src: string}) {
  return <img className="app-language-flag" src={src} alt="" aria-hidden="true" />;
}

function LanguageOptionLabel({flagSrc, label}: {flagSrc: string; label: string}) {
  return (
    <span className="app-language-option">
      <LanguageFlag src={flagSrc} />
      <span>{label}</span>
    </span>
  );
}

export function LanguageSelect({value, className, onChange, ...props}: LanguageSelectProps) {
  const options = languageOptions.map((option) => ({
    value: option.value,
    label: <LanguageOptionLabel flagSrc={option.flagSrc} label={option.label} />,
  }));

  return (
    <Select<AppLanguage, LanguageSelectOption>
      {...props}
      className={['app-language-select', className].filter(Boolean).join(' ')}
      value={value}
      popupMatchSelectWidth={false}
      options={options}
      onChange={onChange}
    />
  );
}

export function LanguageDropdown({value, size, ariaLabel, onChange}: LanguageDropdownProps) {
  const selectedOption = languageOptions.find((option) => option.value === value) ?? languageOptions[0];
  const menuItems: MenuProps['items'] = languageOptions.map((option) => ({
    key: option.value,
    label: <LanguageOptionLabel flagSrc={option.flagSrc} label={option.label} />,
  }));

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: menuItems,
        selectable: true,
        selectedKeys: [value],
        onClick: ({key}) => {
          const nextLanguage = languageOptions.find((option) => option.value === key)?.value;
          if (nextLanguage != null) onChange(nextLanguage);
        },
      }}
    >
      <Button className="app-language-dropdown-button" type="text" size={size} aria-label={ariaLabel}>
        <LanguageFlag src={selectedOption.flagSrc} />
      </Button>
    </Dropdown>
  );
}
