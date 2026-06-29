import {Input, Modal} from 'antd';

interface PromptSgfTextOptions {
  title: string;
  okText: string;
  cancelText: string;
}

export function promptSgfText({title, okText, cancelText}: PromptSgfTextOptions): Promise<string | null> {
  let value = '';

  return new Promise((resolve) => {
    Modal.confirm({
      centered: true,
      title,
      icon: null,
      width: 640,
      content: (
        <Input.TextArea
          autoFocus
          rows={12}
          onChange={(event) => {
            value = event.target.value;
          }}
        />
      ),
      okText,
      cancelText,
      onOk: () => resolve(value),
      onCancel: () => resolve(null),
    });
  });
}
