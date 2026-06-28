import {Input, Modal} from 'antd';
import {normalizeSgfFileName} from '../../app/appFileUtils';

interface PromptSaveFileNameOptions {
  title: string;
  initialValue: string;
  okText: string;
  cancelText: string;
}

export function promptSaveFileName({
  title,
  initialValue,
  okText,
  cancelText,
}: PromptSaveFileNameOptions): Promise<string | null> {
  let value = initialValue;

  return new Promise((resolve) => {
    Modal.confirm({
      centered: true,
      title,
      icon: null,
      content: (
        <Input
          autoFocus
          defaultValue={initialValue}
          onChange={(event) => {
            value = event.target.value;
          }}
        />
      ),
      okText,
      cancelText,
      onOk: () => resolve(normalizeSgfFileName(value)),
      onCancel: () => resolve(null),
    });
  });
}
