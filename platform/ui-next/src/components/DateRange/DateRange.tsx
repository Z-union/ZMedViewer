import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { format, parse, isValid } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import Calendar from '../Calendar';
import Popover from '../Popover';

export type DatePickerWithRangeProps = {
  id: string;
  /** YYYYMMDD (19921022) */
  startDate: string;
  /** YYYYMMDD (19921022) */
  endDate: string;
  /** Callback that received { startDate: string(YYYYMMDD), endDate: string(YYYYMMDD)} */
  onChange: (value: { startDate: string; endDate: string }) => void;
};

export function DatePickerWithRange({
  className,
  id,
  startDate,
  endDate,
  onChange,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & DatePickerWithRangeProps) {
  const [start, setStart] = React.useState<string>(
    startDate ? format(parse(startDate, 'yyyyMMdd', new Date()), 'dd.MM.yyyy') : ''
  );
  const [end, setEnd] = React.useState<string>(
    endDate ? format(parse(endDate, 'yyyyMMdd', new Date()), 'dd.MM.yyyy') : ''
  );
  const [openEnd, setOpenEnd] = React.useState(false);

  const { t } = useTranslation('DatePicker');

  const handleStartSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const formattedDate = format(selectedDate, 'dd.MM.yyyy');
      setStart(formattedDate);
      setOpenEnd(true);
      onChange({
        startDate: format(selectedDate, 'yyyyMMdd'),
        endDate: end ? format(parse(end, 'dd.MM.yyyy', new Date()), 'yyyyMMdd') : '',
      });
    }
  };

  const handleEndSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const formattedDate = format(selectedDate, 'dd.MM.yyyy');
      setEnd(formattedDate);
      setOpenEnd(false);
      onChange({
        startDate: start ? format(parse(start, 'dd.MM.yyyy', new Date()), 'yyyyMMdd') : '',
        endDate: format(selectedDate, 'yyyyMMdd'),
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const value = e.target.value;
    const date = parse(value, 'dd.MM.yyyy', new Date());
    if (type === 'start') {
      setStart(value);
      if (isValid(date)) {
        handleStartSelect(date);
      }
    } else {
      setEnd(value);
      if (isValid(date)) {
        handleEndSelect(date);
      }
    }
  };

  React.useEffect(() => {
    setStart(startDate ? format(parse(startDate, 'yyyyMMdd', new Date()), 'dd.MM.yyyy') : '');
    setEnd(endDate ? format(parse(endDate, 'yyyyMMdd', new Date()), 'dd.MM.yyyy') : '');
  }, [startDate, endDate]);

  return (
    <div className={cn('flex gap-2', className)}>
      <Popover.Popover>
        <Popover.PopoverTrigger asChild>
          <div className="relative w-full">
            <CalendarIcon className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-white" />
            <input
              id={`${id}-start`}
              type="text"
              placeholder={t('Start date')}
              autoComplete="off"
              value={start}
              onChange={e => handleInputChange(e, 'start')}
              className={cn(
                'border-inputfield-main focus:border-inputfield-focus  h-[32px] w-full justify-start rounded border bg-black py-[6.5px] pl-[6.5px] pr-[6.5px] text-left text-sm font-normal hover:bg-black hover:text-white',
                !start && 'text-muted-foreground'
              )}
              data-cy="input-date-range-start"
            />
          </div>
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          className="w-auto p-0"
          align="start"
        >
          <Calendar
            initialFocus
            mode="single"
            defaultMonth={start ? parse(start, 'dd.MM.yyyy', new Date()) : new Date()}
            selected={start ? parse(start, 'dd.MM.yyyy', new Date()) : undefined}
            onSelect={handleStartSelect}
            numberOfMonths={1}
          />
        </Popover.PopoverContent>
      </Popover.Popover>

      <Popover.Popover
        open={openEnd}
        onOpenChange={setOpenEnd}
      >
        <Popover.PopoverTrigger asChild>
          <div className="relative w-full">
            <CalendarIcon className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-white" />
            <input
              id={`${id}-end`}
              type="text"
              placeholder={t('End date')}
              autoComplete="off"
              value={end}
              onChange={e => handleInputChange(e, 'end')}
              className={cn(
                'border-inputfield-main focus:border-inputfield-focus h-full w-full justify-start rounded border bg-black py-[6.5px] pl-[6.5px] pr-[6.5px] text-left text-sm font-normal hover:bg-black hover:text-white',
                !end && 'text-muted-foreground'
              )}
              data-cy="input-date-range-end"
            />
          </div>
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          className="w-auto p-0"
          align="start"
        >
          <Calendar
            initialFocus
            mode="single"
            defaultMonth={start ? parse(start, 'dd.MM.yyyy', new Date()) : new Date()}
            selected={end ? parse(end, 'dd.MM.yyyy', new Date()) : undefined}
            onSelect={handleEndSelect}
            numberOfMonths={1}
          />
        </Popover.PopoverContent>
      </Popover.Popover>
    </div>
  );
}
